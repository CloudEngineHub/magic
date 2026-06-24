import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { VoiceResultUtterance } from "@/components/business/VoiceInput/services/VoiceClient/types"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { useMobileRecordingEntryFacade } from "../hooks/useMobileRecordingEntryFacade"
import {
	resetRecordingSettingsCacheForTests,
	seedRecordingSettingsCacheForTests,
} from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingSettings"
import { audioRecordingsStore } from "@/pages/superMagic/pages/AudioRecordings/stores/audio-recordings-store"

const runtimeMock = {
	state: {
		isRecording: false,
		isPaused: false,
		duration: "00:00:00",
		isStartingRecord: false,
		currentSession: {},
	},
	actions: {
		startRecording: vi.fn(),
		finishRecording: vi.fn(),
		openCurrentRecording: vi.fn(),
		cancelRecording: vi.fn(),
	},
	WaveformComponent: () => null,
}

const recordSummaryServiceMock = {
	ensureProjectAndTopic: vi.fn(),
	pauseRecording: vi.fn(),
	continueRecording: vi.fn(),
	updateNote: vi.fn(),
	on: vi.fn(() => () => undefined),
}

const recordSummaryStoreMock = {
	status: "init",
	isOtherTabRecording: false,
	message: [] as Array<VoiceResultUtterance & { add_time: number; id: string }>,
	note: { content: "", file_extension: "md" },
	errorState: {
		recordingError: undefined as Error | undefined,
	},
	businessData: {
		workspace: null,
		project: null,
		topic: null,
		model: null,
		audioSource: undefined,
	},
}

const workspaceStoreMock = {
	selectedWorkspace: { id: "workspace-1", name: "Workspace One" },
	firstWorkspace: { id: "workspace-1", name: "Workspace One" },
}

const topicModelStoreMock = {
	selectedLanguageModel: {
		id: "model-local-1",
		group_id: "group-1",
		model_id: "model-alpha",
		model_name: "Model Alpha",
		provider_model_id: "model-alpha",
		model_description: "Model Alpha",
		model_icon: "",
		model_status: "normal",
		sort: 1,
	},
}

const recordingTopicModelApiMock = {
	getRecordingTopicModel: vi.fn(),
}

const summaryModelListMock = {
	fetchSummaryModelGroups: vi.fn(),
	resolveDefaultSummaryModelId: vi.fn(),
}

const superMagicApiMock = {
	getWorkspaces: vi.fn(),
	createProject: vi.fn(),
	createAudioProject: vi.fn(),
	deleteProject: vi.fn(),
}

const { audioImportStoreMock } = vi.hoisted(() => ({
	audioImportStoreMock: {
		hasUploadingTasks: false,
		startAudioImport: vi.fn(),
		cancelImport: vi.fn(),
		retryImport: vi.fn(),
	},
}))

function createFileList(files: File[]): FileList {
	return {
		length: files.length,
		item: (index: number) => files[index] ?? null,
		...files,
	} as FileList
}

const audioRecordingsServiceMock = {
	submitSummary: vi.fn(),
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("i18next", () => {
	const chainable = {
		use: vi.fn(() => chainable),
		init: vi.fn(() => Promise.resolve()),
		changeLanguage: vi.fn(() => Promise.resolve()),
		t: (key: string) => key,
	}
	return { default: chainable }
})

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}))

vi.mock("@/components/business/RecordingSummary/internal/editorRuntime", () => ({
	useRecordingEditorRuntime: () => runtimeMock,
}))

vi.mock("@/services/recordSummary/serviceInstance", () => ({
	initializeService: () => recordSummaryServiceMock,
}))

vi.mock("@/stores/recordingSummary", () => ({
	get default() {
		return recordSummaryStoreMock
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	get workspaceStore() {
		return workspaceStoreMock
	},
	projectStore: {},
	topicStore: {},
}))

vi.mock("@/stores/superMagic/topicModelStore", () => ({
	get default() {
		return topicModelStoreMock
	},
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/apis/recording-settings-api", () => ({
	getRecordingTopicModel: (...args: unknown[]) =>
		recordingTopicModelApiMock.getRecordingTopicModel(...args),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/summary-model-list", () => ({
	fetchSummaryModelGroups: (...args: unknown[]) =>
		summaryModelListMock.fetchSummaryModelGroups(...args),
	resolveDefaultSummaryModelId: (...args: unknown[]) =>
		summaryModelListMock.resolveDefaultSummaryModelId(...args),
}))

vi.mock("@/services/audioRecordings/AudioRecordingsService", () => ({
	get audioRecordingsService() {
		return audioRecordingsServiceMock
	},
}))

vi.mock("@/apis", () => ({
	get SuperMagicApi() {
		return superMagicApiMock
	},
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => true,
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/stores/audio-import-store", () => ({
	audioImportStore: audioImportStoreMock,
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModelGroupsByMode: vi.fn(() => []),
	},
}))

vi.mock("@/components/business/RecordingSummary/components/MessageList", () => ({
	default: () => null,
}))

vi.mock("@/components/business/RecordingSummary/AudioUploadAction", () => ({
	default: () => null,
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

describe("useMobileRecordingEntryFacade", () => {
	beforeEach(() => {
		runtimeMock.state.isRecording = false
		runtimeMock.state.isPaused = false
		runtimeMock.state.duration = "00:00:00"
		runtimeMock.actions.startRecording.mockReset()
		runtimeMock.actions.finishRecording.mockReset()
		recordSummaryServiceMock.ensureProjectAndTopic.mockReset()
		recordSummaryServiceMock.pauseRecording.mockReset()
		recordSummaryServiceMock.continueRecording.mockReset()
		recordSummaryServiceMock.updateNote.mockReset()
		recordSummaryServiceMock.on.mockReset()
		recordSummaryServiceMock.on.mockImplementation(() => () => undefined)
		recordSummaryStoreMock.status = "init"
		recordSummaryStoreMock.message = []
		recordSummaryStoreMock.note = { content: "", file_extension: "md" }
		recordSummaryStoreMock.errorState.recordingError = undefined
		recordSummaryStoreMock.businessData.workspace = null
		recordSummaryStoreMock.businessData.project = null
		recordSummaryStoreMock.businessData.topic = null
		recordSummaryStoreMock.businessData.model = null
		workspaceStoreMock.selectedWorkspace = { id: "workspace-1", name: "Workspace One" }
		workspaceStoreMock.firstWorkspace = { id: "workspace-1", name: "Workspace One" }
		recordingTopicModelApiMock.getRecordingTopicModel.mockReset()
		summaryModelListMock.fetchSummaryModelGroups.mockReset()
		summaryModelListMock.resolveDefaultSummaryModelId.mockReset()
		audioRecordingsServiceMock.submitSummary.mockReset()
		audioImportStoreMock.startAudioImport.mockReset()
		superMagicApiMock.getWorkspaces.mockReset()
		superMagicApiMock.createProject.mockReset()
		superMagicApiMock.createAudioProject.mockReset()
		superMagicApiMock.deleteProject.mockReset()
		resetRecordingSettingsCacheForTests()
		audioRecordingsStore.optimisticItems = []

		// Mock navigator.mediaDevices.getUserMedia for jsdom test environment compatibility
		if (typeof navigator !== "undefined") {
			Object.defineProperty(navigator, "mediaDevices", {
				writable: true,
				configurable: true,
				value: {
					getUserMedia: vi.fn().mockResolvedValue({
						getAudioTracks: () => [{ readyState: "live", stop: vi.fn() }],
						getTracks: () => [{ stop: vi.fn() }],
					}),
				},
			})
		}

		const workspace = {
			id: "workspace-audio-001",
			name: "Audio Workspace",
		} as Workspace
		const project = {
			id: "project-audio-001",
			project_name: "Audio Project",
			workspace_id: workspace.id,
			workspace_name: workspace.name,
			project_status: "waiting",
			project_mode: "audio",
			work_dir: "",
			current_topic_id: "topic-audio-001",
			current_topic_status: "waiting",
			created_at: "2026-06-15T00:00:00Z",
			updated_at: "2026-06-15T00:00:00Z",
			tag: "",
		} as unknown as ProjectListItem
		const topic = {
			id: "topic-audio-001",
			topic_name: "Audio Topic",
			project_id: project.id,
			workspace_id: workspace.id,
			topic_mode: "audio",
		} as unknown as Topic

		superMagicApiMock.getWorkspaces.mockResolvedValue({ list: [workspace] })
		superMagicApiMock.createProject.mockResolvedValue({ project, topic })
		superMagicApiMock.createAudioProject.mockResolvedValue({ project, topic })
		superMagicApiMock.deleteProject.mockResolvedValue(undefined)
		recordingTopicModelApiMock.getRecordingTopicModel.mockResolvedValue({
			model: { model_id: "model-alpha" },
			extra: {
				model: { model_id: "model-alpha" },
				auto_summary_enabled: true,
			},
		})
	})

	it("passes disabled auto summary into imported mobile upload context", async () => {
		seedRecordingSettingsCacheForTests(
			{
				model: { model_id: "model-alpha" },
				extra: {
					model: { model_id: "model-alpha" },
					auto_summary_enabled: false,
				},
			},
			{
				transcription_enabled: true,
				auto_summary_enabled: false,
				model_id: "model-alpha",
			},
		)

		superMagicApiMock.getWorkspaces.mockResolvedValue({
			list: [{ id: "workspace-import-mobile", name: "Workspace Import Mobile" }],
		})
		superMagicApiMock.createAudioProject.mockResolvedValue({
			project: {
				id: "project-import-mobile",
				project_name: "Imported Mobile Project",
			},
			topic: {
				id: "topic-import-mobile",
				topic_name: "Imported Mobile Topic",
			},
		})

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.importAudioFiles(
				createFileList([new File(["voice"], "manual-mobile.wav", { type: "audio/wav" })]),
			)
		})

		expect(superMagicApiMock.createAudioProject).toHaveBeenCalledWith(
			expect.objectContaining({
				audio_source: "imported",
				auto_summary: false,
				source: "h5",
			}),
		)
		expect(audioImportStoreMock.startAudioImport).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({
				projectId: "project-import-mobile",
				topicId: "topic-import-mobile",
				autoSummaryEnabled: false,
			}),
		)
	})

	it("defaults to recording presentation when a shared session is already active", () => {
		recordSummaryStoreMock.status = "recording"

		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		expect(result.current.presentation).toBe("recording")
		expect(result.current.isSessionActive).toBe(true)
	})

	it("starts recording with a new audio project context and switches to recording presentation", async () => {
		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.startRecording()
		})

		expect(superMagicApiMock.getWorkspaces).toHaveBeenCalledWith({
			page: 1,
			page_size: 200,
			workspace_type: "audio",
			auto_create: true,
		})
		expect(superMagicApiMock.createAudioProject).toHaveBeenCalledWith(
			expect.objectContaining({
				workspace_id: "workspace-audio-001",
				audio_source: "recorded",
				source: "h5",
			}),
		)
		expect(runtimeMock.actions.startRecording).toHaveBeenCalledWith(
			expect.objectContaining({
				workspace: expect.objectContaining({ id: "workspace-audio-001" }),
				project: expect.objectContaining({ id: "project-audio-001" }),
				topic: expect.objectContaining({ id: "topic-audio-001" }),
				model: expect.objectContaining({ model_id: "model-alpha" }),
			}),
		)
		expect(result.current.presentation).toBe("recording")
	})

	it("collapses back to list presentation without stopping the shared session", async () => {
		recordSummaryStoreMock.status = "recording"

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		act(() => {
			result.current.showList()
		})

		expect(result.current.presentation).toBe("list")
		expect(result.current.isSessionActive).toBe(true)
	})

	it("creates an audio workspace context on demand before starting recording", async () => {
		superMagicApiMock.getWorkspaces.mockResolvedValue({
			list: [{ id: "workspace-2", name: "Workspace Two" }],
		})
		superMagicApiMock.createAudioProject.mockResolvedValue({
			project: {
				id: "project-ensured",
				project_name: "Ensured Project",
				workspace_id: "workspace-2",
			},
			topic: {
				id: "topic-ensured",
				topic_name: "Ensured Topic",
				workspace_id: "workspace-2",
			},
		})

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.startRecording()
		})

		expect(superMagicApiMock.getWorkspaces).toHaveBeenCalledWith({
			page: 1,
			page_size: 200,
			workspace_type: "audio",
			auto_create: true,
		})
		expect(runtimeMock.actions.startRecording).toHaveBeenCalledWith(
			expect.objectContaining({
				workspace: expect.objectContaining({ id: "workspace-2" }),
			}),
		)
	})

	it("hydrates summary model context on demand before starting recording", async () => {
		topicModelStoreMock.selectedLanguageModel = null
		recordingTopicModelApiMock.getRecordingTopicModel.mockResolvedValue({
			model: { model_id: "model-fallback" },
			extra: { model: { model_id: "model-fallback" } },
		})
		summaryModelListMock.fetchSummaryModelGroups.mockResolvedValue([
			{
				group: {
					id: "group-1",
					mode_id: "summary",
					icon: "",
					color: "",
					name: "group",
					description: "",
					sort: 1,
					status: true,
					created_at: "",
				},
				models: [
					{
						id: "model-local-2",
						group_id: "group-1",
						model_id: "model-fallback",
						model_name: "Model Fallback",
						provider_model_id: "model-fallback",
						model_description: "",
						model_icon: "",
						model_status: "normal",
						sort: 1,
					},
				],
				model_ids: ["model-fallback"],
				image_model_ids: [],
				video_model_ids: [],
			},
		])
		summaryModelListMock.resolveDefaultSummaryModelId.mockReturnValue("model-fallback")

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.startRecording()
		})

		expect(recordingTopicModelApiMock.getRecordingTopicModel).toHaveBeenCalled()
		expect(summaryModelListMock.fetchSummaryModelGroups).toHaveBeenCalled()
		expect(runtimeMock.actions.startRecording).toHaveBeenCalledWith(
			expect.objectContaining({
				model: expect.objectContaining({ model_id: "model-fallback" }),
			}),
		)
	})

	it("exposes recording start timeout as an inline error state", async () => {
		topicModelStoreMock.selectedLanguageModel = {
			id: "model-local-timeout",
			group_id: "group-1",
			model_id: "model-alpha",
			model_name: "Model Alpha",
			provider_model_id: "model-alpha",
			model_description: "Model Alpha",
			model_icon: "",
			model_status: "normal",
			sort: 1,
		}
		recordingTopicModelApiMock.getRecordingTopicModel.mockResolvedValue({
			model: { model_id: "model-alpha" },
			extra: { model: { model_id: "model-alpha" } },
		})
		summaryModelListMock.fetchSummaryModelGroups.mockResolvedValue([
			{
				group: {
					id: "group-1",
					mode_id: "summary",
					icon: "",
					color: "",
					name: "group",
					description: "",
					sort: 1,
					status: true,
					created_at: "",
				},
				models: [topicModelStoreMock.selectedLanguageModel],
				model_ids: ["model-alpha"],
				image_model_ids: [],
				video_model_ids: [],
			},
		])
		summaryModelListMock.resolveDefaultSummaryModelId.mockReturnValue("model-alpha")
		runtimeMock.actions.startRecording.mockImplementation(() => new Promise(() => undefined))

		vi.useFakeTimers()

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		const startPromise = act(async () => {
			const pendingStart = result.current.startRecording()
			await vi.advanceTimersByTimeAsync(15001)
			await pendingStart
		})

		await startPromise

		expect(result.current.presentation).toBe("recording")
		expect(result.current.startupState).toBe("error")
		expect(result.current.startupErrorMessage).toBe(
			"mobile.recordingEntry.active.startTimedOut",
		)
		expect(result.current.startupErrorDetail).toContain("recording-start-timeout")

		vi.useRealTimers()
	})

	it("maps recorder permission errors into a specific startup message", async () => {
		let recordingErrorListener: (() => void) | null = null
		recordSummaryServiceMock.on.mockImplementation((_event: string, handler: () => void) => {
			recordingErrorListener = handler
			return () => undefined
		})

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		recordSummaryStoreMock.errorState.recordingError = new Error(
			"Failed to start recording: PermissionDeniedError: Microphone permission denied by user",
		)

		act(() => {
			recordingErrorListener?.()
		})

		expect(result.current.startupState).toBe("error")
		expect(result.current.startupErrorMessage).toBe(
			"mobile.recordingEntry.active.permissionDenied",
		)
		expect(result.current.startupErrorDetail).toContain("Microphone permission denied by user")
	})

	it("passes enabled auto summary into imported mobile upload context", async () => {
		superMagicApiMock.getWorkspaces.mockResolvedValue({
			list: [{ id: "workspace-import", name: "Workspace Import" }],
		})
		superMagicApiMock.createAudioProject.mockResolvedValue({
			project: {
				id: "project-import",
				project_name: "Imported Project",
			},
			topic: {
				id: "topic-import",
				topic_name: "Imported Topic",
			},
		})

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.importAudioFiles(
				createFileList([new File(["voice"], "hello.wav", { type: "audio/wav" })]),
			)
		})

		expect(superMagicApiMock.createAudioProject).toHaveBeenCalledWith(
			expect.objectContaining({
				audio_source: "imported",
				auto_summary: true,
				source: "h5",
			}),
		)
		expect(audioImportStoreMock.startAudioImport).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({
				projectId: "project-import",
				topicId: "topic-import",
				autoSummaryEnabled: true,
			}),
		)
	})

	it("seeds finished recordings with local session duration while backend duration is still pending", async () => {
		runtimeMock.state.duration = "00:12:34"
		runtimeMock.actions.finishRecording.mockImplementation(
			async ({ onSuccess }: { onSuccess?: (result: Record<string, string>) => void }) => {
				onSuccess?.({
					project_id: "project-recorded",
					project_name: "Recorded Project",
					workspace_id: "workspace-recorded",
					model_id: "model-alpha",
					topic_id: "topic-recorded",
				})
			},
		)

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.finishRecording()
		})

		expect(result.current.optimisticItems[0]).toMatchObject({
			id: "project-recorded",
			audio_source: "recorded",
			duration: 754,
			card_status: "summarizing",
		})
	})

	it("skips auto summary when mobile settings disable it", async () => {
		seedRecordingSettingsCacheForTests(
			{
				model: { model_id: "model-alpha" },
				extra: {
					model: { model_id: "model-alpha" },
					auto_summary_enabled: false,
				},
			},
			{
				transcription_enabled: true,
				auto_summary_enabled: false,
				model_id: "model-alpha",
			},
		)

		runtimeMock.actions.finishRecording.mockImplementation(
			async ({
				onSuccess,
				skipSummary,
			}: {
				onSuccess?: (result: Record<string, string>) => void
				skipSummary?: boolean
			}) => {
				expect(skipSummary).toBe(true)
				onSuccess?.({
					project_id: "project-mobile-manual",
					project_name: "Mobile Manual",
					workspace_id: "workspace-mobile",
					model_id: "model-alpha",
					topic_id: "topic-mobile",
				})
			},
		)

		const { useMobileRecordingEntryFacade } =
			await import("../hooks/useMobileRecordingEntryFacade")
		const { result } = renderHook(() => useMobileRecordingEntryFacade())

		await act(async () => {
			await result.current.finishRecording()
		})

		expect(result.current.optimisticItems[0]).toMatchObject({
			id: "project-mobile-manual",
			card_status: "processing",
			current_phase: "merging",
			phase_status: "in_progress",
		})
	})
})
