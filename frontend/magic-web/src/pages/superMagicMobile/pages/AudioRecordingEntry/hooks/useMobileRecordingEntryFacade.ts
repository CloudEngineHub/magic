import type { ComponentType, ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import MessageList from "@/components/business/RecordingSummary/components/MessageList"
import AudioUploadAction from "@/components/business/RecordingSummary/AudioUploadAction"
import { useRecordingEditorRuntime } from "@/components/business/RecordingSummary/internal/editorRuntime"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import {
	UploadSource,
	useFileUpload,
} from "@/pages/superMagic/components/MessageEditor/hooks/useFileUpload"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import type { AudioProjectListItem } from "@/types/audioProject"
import { initializeService } from "@/services/recordSummary/serviceInstance"
import { RECORD_SUMMARY_EVENTS } from "@/services/recordSummary/const/events"
import recordSummaryStore from "@/stores/recordingSummary"
import topicModelStore from "@/stores/superMagic/topicModelStore"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { getRecordingTopicModel } from "../apis/recording-settings-api"
import { fetchSummaryModelGroups, resolveDefaultSummaryModelId } from "../utils/summary-model-list"
import { getCachedMobileRecordingSettings } from "./useMobileRecordingSettings"
import { audioRecordingsService } from "@/services/audioRecordings/AudioRecordingsService"
import { SuperMagicApi } from "@/apis"
import { AUDIO_WORKSPACE_TYPE } from "@/services/audioRecordings"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import type { VoiceResultUtterance } from "@/components/business/VoiceInput/services/VoiceClient/types"

type EntryPresentation = "list" | "recording"
type RecordingStartupState = "idle" | "starting" | "error"

const RECORDING_START_TIMEOUT_MS = 15000

function parseHmsDurationToSeconds(duration: string): number {
	const segments = duration.split(":")
	if (segments.length !== 3) return 0

	const [hoursPart, minutesPart, secondsPart] = segments
	const hours = Number(hoursPart)
	const minutes = Number(minutesPart)
	const seconds = Number(secondsPart)

	if (
		!Number.isFinite(hours) ||
		!Number.isFinite(minutes) ||
		!Number.isFinite(seconds) ||
		hours < 0 ||
		minutes < 0 ||
		seconds < 0
	) {
		return 0
	}

	return hours * 3600 + minutes * 60 + seconds
}

/**
 * Performs a lightweight microphone preflight before we create backend audio
 * resources, so permission/device failures do not leave empty projects behind.
 */
async function ensureMicrophoneReady(): Promise<void> {
	if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
		throw new Error("getUserMedia is not supported")
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
		},
	})

	const hasLiveAudioTrack = stream.getAudioTracks().some((track) => track.readyState === "live")
	stream.getTracks().forEach((track) => track.stop())

	if (!hasLiveAudioTrack) {
		throw new Error("no audio tracks available")
	}
}

/**
 * Maps recorder startup errors to stable UI copy while keeping the raw detail
 * visible for debugging and support during the ongoing mobile rollout.
 */
function resolveRecordingStartupErrorContent(
	t: (key: string) => string,
	error: Error | undefined,
): { message: string; detail: string } {
	if (!error) {
		return {
			message: t("mobile.recordingEntry.active.startFailed"),
			detail: "",
		}
	}

	const rawDetail = error.message || error.name || ""
	const normalizedDetail = rawDetail.toLowerCase()

	if (
		normalizedDetail.includes("permission denied") ||
		normalizedDetail.includes("notallowederror") ||
		normalizedDetail.includes("user denied") ||
		normalizedDetail.includes("microphone permission denied")
	) {
		return {
			message: t("mobile.recordingEntry.active.permissionDenied"),
			detail: rawDetail,
		}
	}

	if (
		normalizedDetail.includes("getusermedia is not supported") ||
		normalizedDetail.includes("not supported in this browser") ||
		normalizedDetail.includes("neither mixed audio nor microphone")
	) {
		return {
			message: t("mobile.recordingEntry.active.browserNotSupported"),
			detail: rawDetail,
		}
	}

	if (
		normalizedDetail.includes("no audio tracks available") ||
		normalizedDetail.includes("audio track is not in 'live' state") ||
		normalizedDetail.includes("failed to obtain media stream") ||
		normalizedDetail.includes("failed to initialize microphone audio source")
	) {
		return {
			message: t("mobile.recordingEntry.active.audioSourceUnavailable"),
			detail: rawDetail,
		}
	}

	if (
		normalizedDetail.includes("recording-start-timeout") ||
		normalizedDetail.includes("failed to start recording")
	) {
		return {
			message: t("mobile.recordingEntry.active.startTimedOut"),
			detail: rawDetail,
		}
	}

	return {
		message: t("mobile.recordingEntry.active.startFailed"),
		detail: rawDetail,
	}
}

/**
 * Builds a stable recording list item so the mobile list can immediately show a
 * "summarizing" card before the backend query catches up.
 */
function buildOptimisticRecordingItem(params: {
	projectId: string
	projectName: string
	workspaceId?: string
	modelId: string
	duration?: number
	audioFileId?: string
	taskKey?: string
	audioSource?: "recorded" | "imported"
	topicId?: string
}): AudioProjectListItem {
	return {
		id: params.projectId,
		project_name: params.projectName,
		// Use unix seconds to match the API contract (created_at is always seconds-based).
		// Date.now() returns milliseconds which would cause parseAudioProjectTimestamp to
		// treat the value as ~57000 AD, breaking the relative time display.
		created_at: Math.floor(Date.now() / 1000),
		duration: params.duration ?? 0,
		tags: [],
		device_id: "",
		audio_source: params.audioSource ?? "recorded",
		current_phase: "summarizing",
		phase_status: "in_progress",
		card_status: "summarizing",
		is_summarized: false,
		workspace_id: params.workspaceId ?? null,
		workspace_name: null,
		model_id: params.modelId,
		audio_file_id: params.audioFileId,
		task_key: params.taskKey,
		topic_id: params.topicId,
	}
}

interface PendingImportRequest {
	projectId: string
	projectName: string
	topicId: string
	workspaceId?: string
	modelId: string
	files: File[]
	status: "queued" | "uploading"
}

interface AudioProjectContext {
	workspace: Workspace
	project: ProjectListItem
	topic: Topic
}

type TranscriptMessage = VoiceResultUtterance & { add_time: number; id: string }

interface MobileRecordingEntryFacadeResult {
	presentation: EntryPresentation
	isSessionActive: boolean
	isRecording: boolean
	isPaused: boolean
	isBusy: boolean
	isImporting: boolean
	startupState: RecordingStartupState
	startupErrorMessage: string
	startupErrorDetail: string
	duration: string
	recordingTitle: string
	transcriptMessages: TranscriptMessage[]
	noteContent: string
	optimisticItems: AudioProjectListItem[]
	refreshToken: number
	startRecording: () => Promise<void>
	showRecording: () => void
	showList: () => void
	pauseRecording: () => Promise<void>
	resumeRecording: () => Promise<void>
	cancelRecording: () => Promise<void>
	finishRecording: () => Promise<void>
	updateNote: (nextContent: string) => void
	renameRecordingTitle: (nextTitle: string) => Promise<boolean>
	importAudioFiles: (files: FileList) => Promise<void>
	retryImport: (projectId: string) => Promise<void>
	clearOptimisticItem: (projectId: string) => void
	AudioUploadActionComponent: ComponentType<{
		handler: (onUpload: () => void) => ReactNode
		onFileChange?: (files: FileList) => void
	}>
	WaveformComponent: ComponentType<{ isRecording: boolean; isPaused: boolean }>
	MessageListComponent: ComponentType<{
		message: TranscriptMessage[]
		isExpanded: boolean
		className?: string
	}>
}

/**
 * Resolves the record-summary model by reusing the same mode model registry that
 * powers the legacy expert flow, so the new mobile page does not fork model lookup.
 */
function resolveRecordSummaryModelSync(): ModelItem | null {
	if (recordSummaryStore.businessData.model) return recordSummaryStore.businessData.model
	if (topicModelStore.selectedLanguageModel) return topicModelStore.selectedLanguageModel

	const cachedSettings = getCachedMobileRecordingSettings()
	const preferredModelId = cachedSettings?.model_id
	if (!preferredModelId) return null

	const modelGroups = superMagicModeService.getModelGroupsByMode(TopicMode.RecordSummary) ?? []
	for (const group of modelGroups) {
		const matchedModel = group.models?.find((model) => model.model_id === preferredModelId)
		if (matchedModel) return matchedModel
	}

	return null
}

/**
 * Centralizes the new `/recordings` mobile session orchestration while still
 * delegating the actual recording pipeline to the shared record-summary runtime.
 */
export function useMobileRecordingEntryFacade(): MobileRecordingEntryFacadeResult {
	const { t } = useTranslation("super")
	const runtime = useRecordingEditorRuntime()
	const recordSummaryService = initializeService()
	const [presentation, setPresentation] = useState<EntryPresentation>(() =>
		recordSummaryStore.status === "init" ? "list" : "recording",
	)
	const [startupState, setStartupState] = useState<RecordingStartupState>("idle")
	const [startupErrorMessage, setStartupErrorMessage] = useState("")
	const [startupErrorDetail, setStartupErrorDetail] = useState("")
	const [optimisticItems, setOptimisticItems] = useState<AudioProjectListItem[]>([])
	const [refreshToken, setRefreshToken] = useState(0)
	const [pendingImportRequest, setPendingImportRequest] = useState<PendingImportRequest | null>(
		null,
	)

	const isSessionActive = recordSummaryStore.status !== "init"
	const isBusy =
		recordSummaryStore.isWaitingSummarize ||
		recordSummaryStore.isPausing ||
		recordSummaryStore.isContinuing ||
		runtime.state.isStartingRecord
	const isImporting = pendingImportRequest?.status === "uploading"

	/**
	 * Resolves the summary model lazily for deep links into `/recordings`, where
	 * neither topicModelStore nor settings sheet data may have been initialized.
	 */
	const resolveRecordingModel = useCallback(async () => {
		const existingModel = resolveRecordSummaryModelSync()
		if (existingModel) return existingModel

		const groups = await fetchSummaryModelGroups()
		const models = groups.flatMap((group) => group.models ?? [])
		if (!models.length) return null

		const settingsResponse = await getRecordingTopicModel().catch(() => null)
		const preferredModelId =
			getCachedMobileRecordingSettings()?.model_id ??
			settingsResponse?.extra?.model?.model_id ??
			settingsResponse?.model?.model_id ??
			resolveDefaultSummaryModelId(models)

		const matchedModel = models.find((model) => model.model_id === preferredModelId)
		return matchedModel ?? models[0] ?? null
	}, [])

	/**
	 * Creates a new audio recording project context under the dedicated audio
	 * workspace so `/audio-projects` queries can later surface it in the list.
	 */
	const createAudioProjectContext = useCallback(
		async (options: {
			projectName?: string
			taskKey: string
			audioSource: "recorded" | "imported"
			modelId?: string
		}): Promise<AudioProjectContext | null> => {
			const workspacesResponse = (await SuperMagicApi.getWorkspaces({
				page: 1,
				page_size: 200,
				workspace_type: AUDIO_WORKSPACE_TYPE,
				auto_create: true,
			})) as {
				list?: Workspace[]
			}
			const audioWorkspace = workspacesResponse.list?.[0]
			if (!audioWorkspace) return null

			const settingsResponse = await getRecordingTopicModel().catch(() => null)
			const autoSummary =
				getCachedMobileRecordingSettings()?.auto_summary_enabled ??
				settingsResponse?.extra?.auto_summary_enabled ??
				true

			const createdProject = await SuperMagicApi.createAudioProject({
				workspace_id: audioWorkspace.id,
				project_name: options.projectName ?? "",
				task_key: options.taskKey,
				auto_summary: autoSummary,
				model_id: options.modelId,
				source: "app",
				device_id: "Mobile Web",
				audio_source: options.audioSource,
				is_hidden: false,
			})

			if (!createdProject?.project || !createdProject?.topic) return null

			return {
				workspace: audioWorkspace,
				project: createdProject.project,
				topic: createdProject.topic,
			}
		},
		[],
	)

	const [projectToFileIdMap, setProjectToFileIdMap] = useState<Record<string, string>>({})

	const {
		addFiles: uploadImportedAudioFiles,
		uploading: isUploadingImportedAudio,
		handleRetry,
	} = useFileUpload({
		projectId: pendingImportRequest?.projectId,
		topicId: pendingImportRequest?.topicId,
		maxUploadCount: 1,
		maxUploadSize: 500 * 1024 * 1024,
		source: UploadSource.RecordSummary,
		onFileAdded: (fileList) => {
			if (fileList.length > 0 && pendingImportRequest) {
				const fileId = fileList[0].id
				const projId = pendingImportRequest.projectId
				setProjectToFileIdMap((prev) => ({
					...prev,
					[projId]: fileId,
				}))
			}
		},
		onFileProgressUpdate: (fileId, progress, status, error) => {
			if (!pendingImportRequest) return
			const projId = pendingImportRequest.projectId
			if (status === "error") {
				setOptimisticItems((currentItems) =>
					currentItems.map((item) =>
						item.id === projId ? { ...item, transferStatus: "failed" } : item,
					),
				)
				toast.error(
					error || t("audioRecordings:summary.submitFailed", { ns: "audioRecordings" }),
				)
			} else if (status === "uploading") {
				setOptimisticItems((currentItems) =>
					currentItems.map((item) =>
						item.id === projId
							? {
									...item,
									transferStatus: "transferring",
									transferProgress: progress / 100,
								}
							: item,
					),
				)
			}
		},
		onFileCompleted: async (_fileId, _reportResult, saveResult) => {
			if (!saveResult || !pendingImportRequest) return

			const importedProject = buildOptimisticRecordingItem({
				projectId: pendingImportRequest.projectId,
				projectName: pendingImportRequest.projectName,
				workspaceId: pendingImportRequest.workspaceId,
				modelId: pendingImportRequest.modelId,
				audioFileId: saveResult.file_id,
				taskKey: saveResult.task_id,
				audioSource: "imported",
				topicId: pendingImportRequest.topicId,
			})
			importedProject.transferStatus = "done"
			importedProject.card_status = "summarizing"

			setOptimisticItems((currentItems) => [
				importedProject,
				...currentItems.filter((item) => item.id !== pendingImportRequest.projectId),
			])

			try {
				await audioRecordingsService.submitSummary(
					importedProject,
					pendingImportRequest.modelId,
				)
			} catch {
				toast.error(t("audioRecordings:summary.submitFailed", { ns: "audioRecordings" }))
			} finally {
				setRefreshToken((currentToken) => currentToken + 1)
				setPendingImportRequest(null)
			}
		},
	})

	useEffect(() => {
		if (!pendingImportRequest || pendingImportRequest.status !== "queued") return

		uploadImportedAudioFiles(pendingImportRequest.files, undefined, "upload")
		setPendingImportRequest((currentRequest) =>
			currentRequest ? { ...currentRequest, status: "uploading" } : currentRequest,
		)
	}, [pendingImportRequest, uploadImportedAudioFiles])

	/**
	 * Keeps the entry page in list mode after a recording ends, while still
	 * allowing the first mount during an active shared session to take over.
	 */
	useEffect(() => {
		if (!isSessionActive && startupState === "idle") {
			setPresentation("list")
		}
		if (isSessionActive) {
			setStartupState("idle")
			setStartupErrorMessage("")
			setStartupErrorDetail("")
		}
	}, [isSessionActive, startupState])

	/**
	 * Converts low-level recording startup failures into the inline mobile error
	 * state so `/recordings` can stay inside the new full-screen experience.
	 */
	useEffect(() => {
		return recordSummaryService.on(RECORD_SUMMARY_EVENTS.RECORDING_ERROR, () => {
			const nextContent = resolveRecordingStartupErrorContent(
				t,
				recordSummaryStore.errorState.recordingError,
			)
			setStartupState("error")
			setStartupErrorMessage(nextContent.message)
			setStartupErrorDetail(nextContent.detail)
		})
	}, [recordSummaryService, t])

	/**
	 * Opens the dedicated recording screen without mutating the underlying
	 * recording session, so the list can later resume the same session.
	 */
	const showRecording = useCallback(() => {
		setPresentation("recording")
	}, [])

	/**
	 * Returns from the full-screen recording page back to the list while keeping
	 * the shared recording session alive, matching the prototype's active-card flow.
	 */
	const showList = useCallback(() => {
		setPresentation("list")
		setStartupState("idle")
		setStartupErrorMessage("")
		setStartupErrorDetail("")
	}, [])

	/**
	 * Starts a recording with ensured workspace/project/topic context so the new
	 * mobile entry reuses the same backend contract as the legacy expert flow.
	 */
	const startRecording = useCallback(async () => {
		if (isSessionActive) {
			setPresentation("recording")
			return
		}

		setPresentation("recording")
		setStartupState("starting")
		setStartupErrorMessage("")
		setStartupErrorDetail("")

		let createdProjectId: string | undefined

		try {
			const model = await resolveRecordingModel()
			if (!model) {
				const nextMessage = t("audioRecordings:summary.missingModel", {
					ns: "audioRecordings",
				})
				setStartupState("error")
				setStartupErrorMessage(nextMessage)
				setStartupErrorDetail("")
				toast.error(nextMessage)
				return
			}

			await ensureMicrophoneReady()

			const taskKey = "session-web-" + createRandomUuidV4()

			const audioProjectContext = await createAudioProjectContext({
				projectName: "",
				taskKey,
				audioSource: "recorded",
				modelId: model.model_id,
			})
			if (!audioProjectContext) {
				const nextMessage = t("mobile.recordingEntry.startMissingWorkspace")
				setStartupState("error")
				setStartupErrorMessage(nextMessage)
				setStartupErrorDetail("")
				toast.error(nextMessage)
				return
			}
			createdProjectId = audioProjectContext.project.id

			await Promise.race([
				Promise.resolve(
					runtime.actions.startRecording({
						workspace: audioProjectContext.workspace,
						project: audioProjectContext.project,
						topic: audioProjectContext.topic,
						selectedTopic: audioProjectContext.topic,
						model,
						audioSource: "microphone",
						sessionId: taskKey,
					}),
				),
				new Promise((_, reject) => {
					window.setTimeout(() => {
						reject(new Error("recording-start-timeout"))
					}, RECORDING_START_TIMEOUT_MS)
				}),
			])

			if (!recordSummaryStore.isRecording && !runtime.state.isRecording) {
				throw new Error("recording-start-failed")
			}

			setStartupState("idle")
			setStartupErrorMessage("")
			setStartupErrorDetail("")
		} catch (error) {
			const hasActiveRecording = recordSummaryStore.isRecording || runtime.state.isRecording
			if (createdProjectId && !hasActiveRecording) {
				// Startup failed after creating a placeholder project; clean it up to avoid empty cards.
				void SuperMagicApi.deleteProject({ id: createdProjectId }).catch(() => undefined)
			}

			const nextContent = resolveRecordingStartupErrorContent(
				t,
				error instanceof Error ? error : undefined,
			)
			setStartupState("error")
			setStartupErrorMessage(nextContent.message)
			setStartupErrorDetail(nextContent.detail)
			toast.error(nextContent.message)
		}
	}, [
		isSessionActive,
		createAudioProjectContext,
		resolveRecordingModel,
		runtime.actions,
		runtime.state.isRecording,
		t,
	])

	/**
	 * Pauses the shared recording session from the new mobile full-screen UI.
	 */
	const pauseRecording = useCallback(async () => {
		try {
			await recordSummaryService.pauseRecording()
		} catch {
			toast.error(t("recordingSummary.recordErrorModal.title"))
		}
	}, [recordSummaryService, t])

	/**
	 * Resumes the shared recording session from the new mobile full-screen UI.
	 */
	const resumeRecording = useCallback(async () => {
		try {
			await recordSummaryService.continueRecording()
		} catch {
			toast.error(t("recordingSummary.recordErrorModal.title"))
		}
	}, [recordSummaryService, t])

	/**
	 * Cancels the current recording entirely and returns the page to the list view.
	 */
	const cancelRecording = useCallback(async () => {
		try {
			await runtime.actions.cancelRecording()
			setPresentation("list")
			setStartupState("idle")
			setStartupErrorMessage("")
			setStartupErrorDetail("")
		} catch {
			toast.error(t("recordingSummary.recordErrorModal.title"))
		}
	}, [runtime.actions, t])

	/**
	 * Completes the recording and immediately seeds a summarizing card so the list
	 * reflects progress before the shared recordings query updates.
	 */
	const finishRecording = useCallback(async () => {
		try {
			await runtime.actions.finishRecording({
				onSuccess: (result) => {
					const localDurationSeconds = parseHmsDurationToSeconds(runtime.state.duration)

					setOptimisticItems((currentItems) => [
						buildOptimisticRecordingItem({
							projectId: result.project_id,
							projectName: result.project_name,
							workspaceId: result.workspace_id,
							modelId: result.model_id,
							duration: localDurationSeconds,
							topicId: result.topic_id,
						}),
						...currentItems.filter((item) => item.id !== result.project_id),
					])
					setRefreshToken((currentToken) => currentToken + 1)
					setPresentation("list")
					setStartupState("idle")
					setStartupErrorMessage("")
					setStartupErrorDetail("")
				},
			})
		} catch {
			toast.error(t("recordingSummary.message.summaryGenerationFailed"))
		}
	}, [runtime.actions, runtime.state.duration, t])

	/**
	 * Updates the lightweight recording note content in-place so the new mobile
	 * note tab stays backed by the same persistence flow as the legacy runtime.
	 */
	const updateNote = useCallback(
		(nextContent: string) => {
			recordSummaryService.updateNote(nextContent)
		},
		[recordSummaryService],
	)

	/**
	 * Persists title edits to the shared audio-recordings backend so the active
	 * session name remains consistent across list/detail surfaces.
	 */
	const renameRecordingTitle = useCallback(
		async (nextTitle: string): Promise<boolean> => {
			const trimmedTitle = nextTitle.trim()
			if (!trimmedTitle) return false

			const currentProject = recordSummaryStore.businessData.project
			if (!currentProject?.id) {
				toast.error(t("audioRecordings:actions.renameFailed", { ns: "audioRecordings" }))
				return false
			}

			try {
				await audioRecordingsService.renameProject(currentProject.id, trimmedTitle)
				await recordSummaryService.updateProject({
					...currentProject,
					project_name: trimmedTitle,
				})
				toast.success(t("audioRecordings:actions.renameSuccess", { ns: "audioRecordings" }))
				return true
			} catch {
				toast.error(t("audioRecordings:actions.renameFailed", { ns: "audioRecordings" }))
				return false
			}
		},
		[recordSummaryService, t],
	)

	const clearOptimisticItem = useCallback((projectId: string) => {
		setOptimisticItems((currentItems) => currentItems.filter((item) => item.id !== projectId))
	}, [])

	const retryImport = useCallback(
		async (projectId: string) => {
			const fileId = projectToFileIdMap[projectId]
			if (!fileId) return

			setOptimisticItems((currentItems) =>
				currentItems.map((item) =>
					item.id === projectId
						? { ...item, transferStatus: "transferring", transferProgress: 0 }
						: item,
				),
			)

			try {
				await handleRetry(fileId)
			} catch (error) {
				console.error("Failed to retry file upload:", error)
			}
		},
		[handleRetry, projectToFileIdMap],
	)

	const importAudioFiles = useCallback(
		async (files: FileList) => {
			const normalizedFiles = Array.from(files)
			if (!normalizedFiles.length) return

			const model = await resolveRecordingModel()
			if (!model) {
				toast.error(t("audioRecordings:summary.missingModel", { ns: "audioRecordings" }))
				return
			}

			const taskKey = "session-web-" + createRandomUuidV4()

			const audioProjectContext = await createAudioProjectContext({
				projectName: normalizedFiles[0]?.name,
				taskKey,
				audioSource: "imported",
				modelId: model.model_id,
			})
			if (!audioProjectContext) {
				toast.error(t("mobile.recordingEntry.startMissingWorkspace"))
				return
			}

			// Immediately seed a transferring card to match the prototype experience.
			const initialOptimisticItem = buildOptimisticRecordingItem({
				projectId: audioProjectContext.project.id,
				projectName: normalizedFiles[0]?.name || audioProjectContext.project.project_name,
				workspaceId: audioProjectContext.workspace.id,
				modelId: model.model_id,
				taskKey,
				audioSource: "imported",
			})
			initialOptimisticItem.transferStatus = "transferring"
			initialOptimisticItem.transferProgress = 0

			setOptimisticItems((currentItems) => [initialOptimisticItem, ...currentItems])

			setPendingImportRequest({
				projectId: audioProjectContext.project.id,
				projectName: normalizedFiles[0]?.name || audioProjectContext.project.project_name,
				topicId: audioProjectContext.topic.id,
				workspaceId: audioProjectContext.workspace.id,
				modelId: model.model_id,
				files: normalizedFiles,
				status: "queued",
			})
		},
		[createAudioProjectContext, resolveRecordingModel, t],
	)

	/**
	 * Exposes transcript items in a single memoized shape for the session page.
	 */
	return {
		presentation,
		isSessionActive,
		isRecording: runtime.state.isRecording,
		isPaused: runtime.state.isPaused,
		isBusy,
		isImporting: isImporting || isUploadingImportedAudio,
		startupState,
		startupErrorMessage,
		startupErrorDetail,
		duration: runtime.state.duration,
		recordingTitle:
			recordSummaryStore.businessData.project?.project_name ||
			recordSummaryStore.businessData.topic?.topic_name ||
			t("mobile.recordingEntry.active.defaultTitle"),
		transcriptMessages: recordSummaryStore.message,
		noteContent: recordSummaryStore.note.content,
		optimisticItems,
		refreshToken,
		startRecording,
		showRecording,
		showList,
		pauseRecording,
		resumeRecording,
		cancelRecording,
		finishRecording,
		updateNote,
		renameRecordingTitle,
		importAudioFiles,
		retryImport,
		clearOptimisticItem,
		AudioUploadActionComponent: AudioUploadAction,
		WaveformComponent: runtime.WaveformComponent,
		MessageListComponent: MessageList,
	}
}
