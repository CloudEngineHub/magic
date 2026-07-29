import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Check, Ellipsis, FileAudio, Loader2, Pencil, Share2, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useLocation, useParams } from "react-router"
import { toast } from "sonner"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { cn } from "@/lib/utils"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { AudioProjectListItem, AudioRecordingCardStatus } from "@/types/audioProject"
import {
	recordingGroupsService,
	UNGROUPED_RECORDING_GROUP_ID,
	type AudioRecordingGroup,
} from "@/services/audioRecordings"
import {
	buildOptimisticSummarizingProject,
	deleteAudioRecordingProjects,
	moveAudioRecordingProjects,
	renameAudioRecordingProject,
	resubmitAudioRecordingSummary,
	submitAudioRecordingSummary,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recording-actions"
import {
	isAudioProjectSummaryReady,
	resolveRecordingDisplayName,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"
import { resolveDetailSummaryVisualState } from "@/pages/superMagic/pages/AudioRecordings/utils/summary-action-utils"
import { saveMediaSpeakersAndMagicProjectJs } from "@/pages/superMagic/components/Detail/contents/HTML/media/utils"
import type { MobileRecordingTopTab } from "./types"
import { useMobileRecordingAudioPlayer } from "./hooks/useMobileRecordingAudioPlayer"
import { useRecordingPlayerCurrentSec } from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingPlayerCurrentSec"
import { useRecordingColorSegments } from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingColorSegments"
import { useMobileRecordingDetailData } from "./hooks/useMobileRecordingDetailData"
import { MobileRecordingAudioPlayer } from "./components/MobileRecordingAudioPlayer"
import { MobileRecordingSourcePanel } from "./components/MobileRecordingSourcePanel"
import { MobileRecordingSummaryPanel } from "./components/MobileRecordingSummaryPanel"
import { MobileRecordingSummaryPlaceholder } from "./components/MobileRecordingSummaryPlaceholder"
import { MobileRecordingShareExportSheet } from "./components/MobileRecordingShareExportSheet"
import { collectSpeakerIdsFromText } from "./utils/markdown-time-links"
import { normalizeSpeakerSelection } from "@/pages/superMagic/pages/AudioRecordings/utils/speaker-filter"
import { MobileRecordingMoreSheet } from "@/pages/superMagicMobile/pages/AudioRecordingEntry/components/MobileRecordingMoreSheet"
import { MobileRecordingMoveGroupSheet } from "@/pages/superMagicMobile/pages/AudioRecordingEntry/components/MobileRecordingMoveGroupSheet"
import type { MobileRecordingGroup } from "@/pages/superMagicMobile/pages/AudioRecordingEntry/components/MobileRecordingGroupSheet"
import ProjectShareSheet from "@/pages/superMagicMobile/components/ProjectShareSheet"
import { buildRecordingShareSelection } from "@/pages/superMagic/pages/AudioRecordings/utils/build-recording-share-selection"
import { downloadRecordingAudioFile } from "@/pages/superMagic/pages/AudioRecordings/utils/download-recording-audio"
import { AudioRecordingCopyDialog } from "@/pages/superMagic/pages/AudioRecordings/components/AudioRecordingCopyDialog"
import { useAudioRecordingCopyToProject } from "@/pages/superMagic/pages/AudioRecordings/hooks/useAudioRecordingCopyToProject"
import { canCopyAudioProject } from "@/pages/superMagic/pages/AudioRecordings/utils/copy-availability"

const COLLAPSED_PLAYER_HEIGHT = 40
const EXPANDED_PLAYER_HEIGHT = 182
const FLOATING_PLAYER_BOTTOM = 12

interface AudioRecordingDetailLocationState {
	projectName?: string
	cardStatus?: AudioRecordingCardStatus
	audioFileId?: string
}

/** Mobile H5 recording detail preview for completed transcript and summary attachments. */
export default function MobileAudioRecordingDetailPage() {
	const { t } = useTranslation("audioRecordings")
	const navigate = useNavigate()
	const location = useLocation()
	const { projectId = "" } = useParams<{ projectId: string }>()
	const locationState = location.state as AudioRecordingDetailLocationState | null
	const {
		loading,
		error,
		projectItem,
		fileMap,
		texts,
		audioUrl,
		title,
		attachmentList,
		mutateAudioProjectItem,
	} = useMobileRecordingDetailData({
		projectId,
		initialTitle: locationState?.projectName,
	})
	const player = useMobileRecordingAudioPlayer(audioUrl)
	const playerCurrentSec = useRecordingPlayerCurrentSec(
		player.audioRef,
		player.playing,
		player.currentTime,
	)
	const [playerScrollSignal, setPlayerScrollSignal] = useState(0)
	const [detailItem, setDetailItem] = useState<AudioProjectListItem | null>(null)
	const [titleOverride, setTitleOverride] = useState("")
	const [renameDialogOpen, setRenameDialogOpen] = useState(false)
	const [speakerSettingsOpen, setSpeakerSettingsOpen] = useState(false)
	const [moreSheetOpen, setMoreSheetOpen] = useState(false)
	const [moveGroupSheetOpen, setMoveGroupSheetOpen] = useState(false)
	const [groups, setGroups] = useState<MobileRecordingGroup[]>([])
	const [ungroupedCount, setUngroupedCount] = useState(0)
	const [titleInput, setTitleInput] = useState("")
	const [speakerDraft, setSpeakerDraft] = useState<Record<string, string>>({})
	const [speakerNameOverrides, setSpeakerNameOverrides] = useState<Record<string, string>>({})
	const [speakerFilterProjectId, setSpeakerFilterProjectId] = useState(projectId)
	const [selectedSpeakerIds, setSelectedSpeakerIds] = useState<string[]>([])
	const [renaming, setRenaming] = useState(false)
	const [actionSubmitting, setActionSubmitting] = useState(false)
	const [summarySubmitting, setSummarySubmitting] = useState(false)
	const [playerExpanded, setPlayerExpanded] = useState(false)
	const [shareExportSheetOpen, setShareExportSheetOpen] = useState(false)
	const [projectShareSheetOpen, setProjectShareSheetOpen] = useState(false)
	const titleInputRef = useRef<HTMLInputElement>(null)
	const defaultTab = useMemo<MobileRecordingTopTab>(() => {
		const cardStatus =
			detailItem?.card_status ?? projectItem?.card_status ?? locationState?.cardStatus
		return cardStatus === "summarized" ? "summary" : "source"
	}, [detailItem?.card_status, locationState?.cardStatus, projectItem?.card_status])
	const [activeTab, setActiveTab] = useState<MobileRecordingTopTab>(defaultTab)
	const recordingShareSelection = useMemo(() => buildRecordingShareSelection(fileMap), [fileMap])
	const copyController = useAudioRecordingCopyToProject()

	useEffect(() => {
		setActiveTab(defaultTab)
	}, [defaultTab])

	useEffect(() => {
		setDetailItem(projectItem)
	}, [projectItem])

	useEffect(() => {
		// Hydrate speaker aliases from the saved bundle metadata so refresh restores the last confirmed names.
		setSpeakerNameOverrides(fileMap?.magicProjectConfig?.metadata?.speakers ?? {})
	}, [fileMap?.magicProjectConfig?.metadata?.speakers, projectId])

	const summaryReady = useMemo(() => {
		const item = detailItem ?? projectItem
		if (item) return isAudioProjectSummaryReady(item)
		return locationState?.cardStatus === "summarized"
	}, [detailItem, locationState?.cardStatus, projectItem])

	const displayTitle = titleOverride || title || t("detail.untitled")
	const resolvedActionItem = useMemo(
		() =>
			detailItem ||
			projectItem ||
			buildFallbackActionItem({
				projectId,
				title: displayTitle,
				cardStatus: locationState?.cardStatus,
				audioFileId: locationState?.audioFileId,
			}),
		[
			detailItem,
			displayTitle,
			locationState?.audioFileId,
			locationState?.cardStatus,
			projectId,
			projectItem,
		],
	)
	const summaryVisualState = useMemo(
		() =>
			resolveDetailSummaryVisualState({
				summaryReady,
				phase: resolvedActionItem?.current_phase ?? null,
				status: resolvedActionItem?.phase_status ?? null,
				cardStatus: resolvedActionItem?.card_status ?? locationState?.cardStatus,
				isSubmitting: summarySubmitting,
				extra: {
					task_key: resolvedActionItem?.task_key,
					topic_id: resolvedActionItem?.topic_id,
					audio_file_id: resolvedActionItem?.audio_file_id,
					audio_source: resolvedActionItem?.audio_source,
					model_id: resolvedActionItem?.model_id,
				},
			}),
		[
			locationState?.cardStatus,
			resolvedActionItem?.audio_file_id,
			resolvedActionItem?.audio_source,
			resolvedActionItem?.card_status,
			resolvedActionItem?.current_phase,
			resolvedActionItem?.model_id,
			resolvedActionItem?.phase_status,
			resolvedActionItem?.task_key,
			resolvedActionItem?.topic_id,
			summaryReady,
			summarySubmitting,
		],
	)
	const detailUnavailable =
		!summaryReady && summaryVisualState.status === "unavailable" && Boolean(resolvedActionItem)
	const transcriptSpeakerIds = useMemo(
		() => collectRecordingSpeakerIds([texts.transcript?.content]),
		[texts.transcript?.content],
	)
	const activeSpeakerIds = useMemo(
		() =>
			collectRecordingSpeakerIds([
				texts.transcript?.content,
				texts.notes?.content,
				...Object.values(texts.summary).map((file) => file?.content),
			]),
		[texts.notes?.content, texts.summary, texts.transcript?.content],
	)
	const effectiveSelectedSpeakerIds = useMemo(
		() =>
			speakerFilterProjectId === projectId
				? normalizeSpeakerSelection(transcriptSpeakerIds, selectedSpeakerIds)
				: transcriptSpeakerIds,
		[projectId, selectedSpeakerIds, speakerFilterProjectId, transcriptSpeakerIds],
	)
	const speakerNameMap = useMemo(
		() =>
			Object.fromEntries(
				activeSpeakerIds.map((speakerId) => [
					speakerId,
					speakerNameOverrides[speakerId]?.trim() || speakerId,
				]),
			),
		[activeSpeakerIds, speakerNameOverrides],
	)
	const scrollPaddingBottom =
		FLOATING_PLAYER_BOTTOM +
		(playerExpanded ? EXPANDED_PLAYER_HEIGHT : COLLAPSED_PLAYER_HEIGHT) +
		20

	const colorSegments = useRecordingColorSegments(summaryReady, texts.summary.topics?.content)

	/** Closes the floating player rate menu when source/summary panels scroll. */
	function handlePlayerContentScroll() {
		setPlayerScrollSignal((value) => value + 1)
	}

	useEffect(() => {
		setTitleOverride("")
		setRenameDialogOpen(false)
		setSpeakerSettingsOpen(false)
		setMoreSheetOpen(false)
		setMoveGroupSheetOpen(false)
		setPlayerExpanded(false)
		setShareExportSheetOpen(false)
		setProjectShareSheetOpen(false)
	}, [projectId])

	useEffect(() => {
		if (speakerFilterProjectId === projectId) return
		setSpeakerFilterProjectId(projectId)
		setSelectedSpeakerIds([])
	}, [projectId, speakerFilterProjectId])

	useEffect(() => {
		if (!renameDialogOpen) return

		// Focus after the dialog paints so the mobile keyboard opens on the active field.
		requestAnimationFrame(() => {
			titleInputRef.current?.focus()
			titleInputRef.current?.select()
		})
	}, [renameDialogOpen])

	/** Navigates back to the shared recordings list route. */
	function handleBack() {
		navigate({ name: RouteName.AudioRecordings })
	}

	/** Navigates to the recording project route so the mobile Super Magic layout can restore its state. */
	function handleOpenProject(item: AudioProjectListItem) {
		navigate({
			name: RouteName.SuperWorkspaceProjectState,
			params: { projectId: item.id },
		})
	}

	/** Summary time chips only control playback so users can stay on the current summary tab. */
	function handleSummaryTimeClick(start: number, end?: number) {
		player.playSegment({ start, end })
	}

	/** Opens the rename sheet and collapses the player to keep the editor readable. */
	function openRenameDialog() {
		setTitleInput(displayTitle)
		setRenameDialogOpen(true)
		setPlayerExpanded(false)
	}

	/** Opens the shared more-actions sheet only when the detail payload is ready for safe actions. */
	function openMoreSheet() {
		if (loading || error || !resolvedActionItem) return
		setMoreSheetOpen(true)
		setPlayerExpanded(false)
	}

	/** Opens the shared speaker-name editor with the current effective display names. */
	function openSpeakerSettings() {
		setSpeakerDraft(
			Object.fromEntries(
				activeSpeakerIds.map((speakerId) => [
					speakerId,
					speakerNameMap[speakerId] ?? speakerId,
				]),
			),
		)
		setSpeakerSettingsOpen(true)
		setPlayerExpanded(false)
	}

	/** Keeps transcript filtering session-local while leaving rename/display speaker discovery sourced from all content files. */
	function handleSelectedSpeakerIdsChange(speakerIdsToSelect: string[]) {
		setSpeakerFilterProjectId(projectId)
		setSelectedSpeakerIds(speakerIdsToSelect)
	}

	/** Opens the prototype-aligned share/export sheet instead of routing share through the more-actions menu. */
	function openShareExportSheet() {
		if (!projectId || loading || error) return
		setShareExportSheetOpen(true)
		setMoreSheetOpen(false)
		setPlayerExpanded(false)
	}

	/** Downloads the original audio asset only, leaving format conversion for a later milestone. */
	async function handleDownloadOriginal() {
		const success = await downloadRecordingAudioFile({
			fileId: fileMap?.audio?.file_id || resolvedActionItem?.audio_file_id,
			audioFile: fileMap?.audio,
			fallbackName: displayTitle,
		})
		if (!success) {
			toast.error(t("detail.loadFailed"))
		}
	}

	/** Opens the existing project-share flow from the dedicated share/export launcher. */
	function openProjectShareSheet() {
		if (recordingShareSelection.defaultSelectedFileIds.length === 0) {
			toast.error(t("super:share.noShareableFiles"))
			return
		}

		setShareExportSheetOpen(false)
		setProjectShareSheetOpen(true)
	}

	/** Saves local speaker names so transcript and summary content update together. */
	async function submitSpeakerSettings() {
		const nextNames = Object.fromEntries(
			activeSpeakerIds
				.map((speakerId) => [speakerId, speakerDraft[speakerId]?.trim()] as const)
				.filter(([, name]) => Boolean(name)),
		)
		try {
			// Persist speaker aliases back into magic.project.js so refresh and desktop HTML preview stay in sync.
			if (texts.magicProject?.fileId) {
				await saveMediaSpeakersAndMagicProjectJs({
					mediaSpeakers: nextNames,
					magicProjectJsFileInfo: {
						fileId: texts.magicProject.fileId,
						content: texts.magicProject.content,
					},
				})
			}
			setSpeakerNameOverrides(nextNames)
			setSpeakerSettingsOpen(false)
		} catch {
			toast.error(t("detail.loadFailed"))
		}
	}

	/** Closes the rename dialog without mutating the current recording title. */
	function closeRenameDialog() {
		if (renaming) return
		setRenameDialogOpen(false)
		setTitleInput(displayTitle)
	}

	/** Persists the renamed title through the recording service. */
	async function submitRename() {
		const trimmed = titleInput.trim()
		if (renaming) return
		if (!projectId || !trimmed || trimmed === displayTitle) {
			setRenameDialogOpen(false)
			return
		}

		setRenaming(true)
		try {
			await renameAudioRecordingProject(projectId, trimmed)
			setTitleOverride(trimmed)
			setDetailItem((current) => (current ? { ...current, project_name: trimmed } : current))
			setRenameDialogOpen(false)
			toast.success(t("actions.renameSuccess"))
		} catch {
			toast.error(t("actions.renameFailed"))
		} finally {
			setRenaming(false)
		}
	}

	/** Loads move-target groups lazily so the detail page stays light until users open that flow. */
	async function ensureGroupsLoaded() {
		try {
			const result = await recordingGroupsService.listGroups()
			setGroups(result.groups.map(mapAudioRecordingGroupToMobileGroup))
			setUngroupedCount(result.ungroupedCount)
		} catch {
			toast.error(t("detail.loadFailed"))
		}
	}

	/** Opens the move-group sheet from the shared more-actions menu. */
	function handleOpenMoveGroup() {
		void ensureGroupsLoaded()
		setMoveGroupSheetOpen(true)
	}

	/** Deletes the current detail project and routes users back to the recordings list on success. */
	async function handleDelete(projectIdToDelete: string) {
		if (actionSubmitting) return false

		setActionSubmitting(true)
		try {
			await deleteAudioRecordingProjects([projectIdToDelete])
			toast.success(t("actions.deleteSuccess"))
			navigate({
				name: RouteName.AudioRecordings,
				state: { deletedProjectId: projectIdToDelete },
			})
			return true
		} catch {
			toast.error(t("actions.deleteFailed"))
			return false
		} finally {
			setActionSubmitting(false)
		}
	}

	/** Reuses the shared summary submit action and immediately flips the detail page into summarizing state. */
	async function handleSummarize(item: AudioProjectListItem) {
		if (summarySubmitting) return false

		setSummarySubmitting(true)
		try {
			const result = await submitAudioRecordingSummary(item)
			if (!result.ok) {
				if (result.reason === "missingParams") {
					toast.error(t("summary.missingParams"))
				} else if (result.reason === "missingModel") {
					toast.error(t("summary.missingModel"))
				} else {
					toast.error(t("summary.submitFailed"))
				}
				return false
			}

			const optimisticItem = buildOptimisticSummarizingProject(item)
			setDetailItem(optimisticItem)
			mutateAudioProjectItem(optimisticItem)
			setActiveTab("summary")
			return true
		} finally {
			setSummarySubmitting(false)
		}
	}

	/** Routes summary actions to initial generation or direct re-summary based on current detail state. */
	async function handleSummaryAction(item: AudioProjectListItem) {
		if (
			summaryReady ||
			summaryVisualState.status === "failed" ||
			item.card_status === "summarized"
		) {
			return handleResummarize()
		}
		return handleSummarize(item)
	}

	/** Submits direct re-summary and immediately flips the mobile detail into summarizing state. */
	async function handleResummarize() {
		if (!resolvedActionItem || summarySubmitting) return false

		setSummarySubmitting(true)
		try {
			const result = await resubmitAudioRecordingSummary(resolvedActionItem)
			if (!result.ok) {
				if (result.reason === "missingParams") {
					toast.error(t("summary.missingParams"))
				} else if (result.reason === "missingModel") {
					toast.error(t("summary.missingModel"))
				} else {
					toast.error(t("summary.submitFailed"))
				}
				return false
			}

			const optimisticItem = buildOptimisticSummarizingProject(resolvedActionItem)
			setDetailItem(optimisticItem)
			mutateAudioProjectItem(optimisticItem)
			setActiveTab("summary")
			return true
		} finally {
			setSummarySubmitting(false)
		}
	}

	/** Moves the current project to another group and patches local metadata without reloading the page. */
	async function handleMoveGroup(targetGroupId: string) {
		if (!detailItem || actionSubmitting) return

		setActionSubmitting(true)
		try {
			await moveAudioRecordingProjects([detailItem.id], targetGroupId)
			setDetailItem((current) =>
				current ? { ...current, workspace_id: targetGroupId } : current,
			)
			toast.success(t("super:mobile.recordingEntry.groupSheet.moveSuccess"))
		} catch {
			toast.error(t("super:mobile.recordingEntry.groupSheet.moveFailed"))
		} finally {
			setActionSubmitting(false)
		}
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-[#f7f7f8] text-foreground"
			data-testid="mobile-recording-detail-page"
		>
			<header className="shrink-0 border-b border-border/70 bg-[#f7f7f8]">
				{/* Reuse the shared mobile page-header sizing so the recording detail top bar matches project detail icon weight and button scale. */}
				<div className="mobile-page-header pb-0">
					<button
						type="button"
						className="mobile-page-header-btn transition-transform active:scale-95"
						onClick={handleBack}
						aria-label={t("detail.back")}
						data-testid="mobile-recording-detail-back"
					>
						<ChevronLeft className="size-[22px]" />
					</button>

					{/* Keep the segmented tabs visually centered without stealing hit targets from the left/right floating action buttons. */}
					<div className="pointer-events-none absolute inset-x-0 flex justify-center px-[114px]">
						<div className="pointer-events-auto grid grid-cols-2 rounded-full bg-muted p-[3px]">
							<TopTabButton
								active={activeTab === "source"}
								label={t("detail.tabs.source")}
								onClick={() => setActiveTab("source")}
							/>
							<TopTabButton
								active={activeTab === "summary"}
								label={t("detail.tabs.summaryRoot")}
								onClick={() => setActiveTab("summary")}
							/>
						</div>
					</div>

					{/* Match the project detail action capsule so share/more icons use the same 48px slots and 22px Lucide sizing. */}
					<div className="ml-auto flex h-12 shrink-0 items-stretch overflow-hidden rounded-full bg-card text-foreground shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)] dark:shadow-[0px_8px_25px_0px_rgba(0,0,0,0.32)]">
						<HeaderIconButton
							label={t("detail.share")}
							icon={<Share2 className="size-[22px]" />}
							onClick={openShareExportSheet}
						/>
						<HeaderIconButton
							label={t("card.moreActions")}
							icon={<Ellipsis className="size-[22px]" />}
							onClick={openMoreSheet}
						/>
					</div>
				</div>

				<div className="flex items-center gap-2 px-4 pb-2 pt-1">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
						<FileAudio
							className="size-[18px] text-muted-foreground"
							strokeWidth={1.8}
						/>
					</span>
					<h1 className="min-w-0 flex-1 truncate text-[17px] font-medium leading-6">
						{displayTitle}
					</h1>
					<HeaderIconButton
						label={t("card.rename")}
						icon={<Pencil className="size-4" />}
						onClick={openRenameDialog}
					/>
				</div>
			</header>

			<main className="relative flex min-h-0 flex-1 flex-col">
				{loading ? (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						<Loader2 className="mr-2 size-4 animate-spin" />
						{t("detail.loading")}
					</div>
				) : null}

				{!loading && error ? (
					<div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
						{t("detail.loadFailed")}
					</div>
				) : null}

				{!loading && !error && detailUnavailable ? (
					<div
						className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground"
						data-testid="mobile-recording-detail-unavailable"
					>
						{t("detail.loadFailed")}
					</div>
				) : null}

				{!loading && !error && !detailUnavailable && activeTab === "source" ? (
					<MobileRecordingSourcePanel
						transcriptContent={texts.transcript?.content}
						notesContent={texts.notes?.content}
						playing={player.playing}
						currentTime={player.currentTime}
						scrollPaddingBottom={scrollPaddingBottom}
						availableSpeakerIds={transcriptSpeakerIds}
						selectedSpeakerIds={effectiveSelectedSpeakerIds}
						speakerNameMap={speakerNameMap}
						onSelectedSpeakerIdsChange={handleSelectedSpeakerIdsChange}
						onOpenSpeakerSettings={openSpeakerSettings}
						onSeek={(seconds) => player.seekTo(seconds, { autoplay: true })}
						onContentScroll={handlePlayerContentScroll}
					/>
				) : null}

				{!loading && !error && !detailUnavailable && activeTab === "summary" ? (
					summaryReady ? (
						<MobileRecordingSummaryPanel
							summaryFiles={fileMap?.summaryFiles ?? []}
							summaryContent={Object.fromEntries(
								Object.entries(texts.summary).map(([type, file]) => [
									type,
									file?.content,
								]),
							)}
							attachmentList={attachmentList}
							scrollPaddingBottom={scrollPaddingBottom}
							speakerNameMap={speakerNameMap}
							onOpenSpeakerSettings={openSpeakerSettings}
							onTimeClick={handleSummaryTimeClick}
							onContentScroll={handlePlayerContentScroll}
						/>
					) : (
						<MobileRecordingSummaryPlaceholder
							status={summaryVisualState.status}
							canGenerate={summaryVisualState.canGenerate}
							submitting={summarySubmitting}
							onGenerate={() => {
								if (!resolvedActionItem) return
								void handleSummaryAction(resolvedActionItem)
							}}
						/>
					)
				) : null}
			</main>

			<MobileRecordingAudioPlayer
				audioRef={player.audioRef}
				audioUrl={audioUrl}
				currentSec={playerCurrentSec}
				duration={player.duration}
				playing={player.playing}
				expanded={playerExpanded}
				onToggle={player.toggle}
				onSeek={(seconds) => player.seekTo(seconds, { autoplay: false })}
				onExpandedChange={setPlayerExpanded}
				playbackRate={player.playbackRate}
				onPlaybackRateChange={player.setPlaybackRate}
				colorSegments={colorSegments}
				scrollSignal={playerScrollSignal}
			/>

			<MobileRecordingRenameSheet
				isOpen={renameDialogOpen}
				inputRef={titleInputRef}
				value={titleInput}
				renaming={renaming}
				onValueChange={setTitleInput}
				onCancel={closeRenameDialog}
				onConfirm={() => void submitRename()}
			/>

			<MobileRecordingSpeakerSheet
				isOpen={speakerSettingsOpen}
				speakerIds={activeSpeakerIds}
				value={speakerDraft}
				onValueChange={setSpeakerDraft}
				onCancel={() => setSpeakerSettingsOpen(false)}
				onConfirm={() => void submitSpeakerSettings()}
			/>

			<MobileRecordingMoreSheet
				isOpen={moreSheetOpen}
				item={resolvedActionItem}
				onClose={() => setMoreSheetOpen(false)}
				onRename={async (projectIdToRename, name) => {
					const trimmed = name.trim()
					if (!trimmed || actionSubmitting) return false

					setActionSubmitting(true)
					try {
						await renameAudioRecordingProject(projectIdToRename, trimmed)
						setTitleOverride(trimmed)
						setDetailItem((current) =>
							current ? { ...current, project_name: trimmed } : current,
						)
						toast.success(t("actions.renameSuccess"))
						return true
					} catch {
						toast.error(t("actions.renameFailed"))
						return false
					} finally {
						setActionSubmitting(false)
					}
				}}
				onDelete={handleDelete}
				onOpenProject={handleOpenProject}
				onSummarize={handleSummaryAction}
				onMoveToGroup={handleOpenMoveGroup}
				onCopyToProject={(item) => {
					void copyController.openCopyToProject(item)
				}}
				// Wire the more-actions "share" entry to the same share & export sheet opened by the header share button,
				// matching the prototype's single-share-sheet behavior (RecordingDetailScreen onShare).
				onShare={openShareExportSheet}
				isSubmittingAction={actionSubmitting}
				isSubmittingSummary={summarySubmitting}
				canCopyToProject={
					resolvedActionItem ? canCopyAudioProject(resolvedActionItem).canCopy : false
				}
				showRegenerateAction
			/>

			<MobileRecordingMoveGroupSheet
				open={moveGroupSheetOpen}
				onOpenChange={setMoveGroupSheetOpen}
				groups={groups}
				selectedGroupId={detailItem?.workspace_id ?? UNGROUPED_RECORDING_GROUP_ID}
				ungroupedCount={ungroupedCount}
				onSelect={(groupId) => {
					void handleMoveGroup(groupId)
				}}
			/>

			<MobileRecordingShareExportSheet
				open={shareExportSheetOpen}
				recordingName={displayTitle}
				fileMap={fileMap}
				projectId={projectId}
				onOpenChange={setShareExportSheetOpen}
				onShareLink={openProjectShareSheet}
				onDownloadRecording={() => {
					void handleDownloadOriginal()
				}}
			/>

			<ProjectShareSheet
				open={projectShareSheetOpen}
				onClose={() => setProjectShareSheetOpen(false)}
				mode="file"
				projectMode="audio"
				projectId={projectId}
				projectName={displayTitle}
				attachments={recordingShareSelection.shareableFiles}
				attachmentList={recordingShareSelection.shareableFiles}
				fileMap={fileMap ?? undefined}
				defaultSelectedFileIds={recordingShareSelection.defaultSelectedFileIds}
			/>
			<AudioRecordingCopyDialog controller={copyController} />
		</div>
	)
}

/** Maps service group DTOs into the mobile sheet shape without leaking service-only fields into the view. */
function mapAudioRecordingGroupToMobileGroup(group: AudioRecordingGroup): MobileRecordingGroup {
	return {
		id: group.id,
		name: group.name,
		projectCount: group.projectCount,
		isVirtual: false,
		workspaceType: group.workspaceType,
	}
}

/** Builds a minimal detail action item so header actions still work during direct-link recovery. */
function buildFallbackActionItem(input: {
	projectId: string
	title: string
	cardStatus?: AudioRecordingCardStatus
	audioFileId?: string
}): AudioProjectListItem | null {
	if (!input.projectId) return null

	return {
		id: input.projectId,
		project_name: resolveRecordingDisplayName(input.title, 0),
		created_at: 0,
		duration: 0,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: input.cardStatus === "summarized" ? "summarizing" : "merging",
		phase_status: input.cardStatus === "summarized" ? "completed" : "in_progress",
		card_status: input.cardStatus ?? "not_summarized",
		is_summarized: input.cardStatus === "summarized",
		task_key: "",
		topic_id: "",
		audio_file_id: input.audioFileId ?? "",
		model_id: "",
		workspace_id: "",
	}
}

/** Top-level segmented tab used for Source/Summary switching. */
function TopTabButton({
	active,
	label,
	onClick,
}: {
	active: boolean
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			className={cn(
				"h-[30px] rounded-full px-4 text-[14px] transition-colors",
				active
					? "bg-card font-medium text-foreground shadow-[0_8px_25px_rgba(0,0,0,0.10)]"
					: "font-normal text-muted-foreground",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	)
}

/** Header icon-only affordance used to match the prototype while deferring share/more logic. */
function HeaderIconButton({
	label,
	icon,
	onClick,
}: {
	label: string
	icon: ReactNode
	onClick?: () => void
}) {
	return (
		<button
			type="button"
			/* Use 48px touch targets inside the shared capsule so the recording detail header matches the project detail affordance geometry. */
			className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-transparent active:opacity-70"
			aria-label={label}
			onClick={onClick}
		>
			{icon}
		</button>
	)
}

/** Bottom rename form that mirrors the APP prototype sheet controls. */
function MobileRecordingRenameSheet({
	isOpen,
	inputRef,
	value,
	renaming,
	onValueChange,
	onCancel,
	onConfirm,
}: {
	isOpen: boolean
	inputRef: React.RefObject<HTMLInputElement>
	value: string
	renaming: boolean
	onValueChange: (value: string) => void
	onCancel: () => void
	onConfirm: () => void
}) {
	const { t } = useTranslation("audioRecordings")

	/** Submits from the keyboard without letting the browser reload the H5 route. */
	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		onConfirm()
	}

	return (
		<MagicPopup
			visible={isOpen}
			onClose={onCancel}
			position="bottom"
			title={t("actions.renameTitle")}
			headerVariant="actionHeader"
			headerTitle={t("actions.renameTitle")}
			headerLeadingAction={{
				icon: <X />,
				ariaLabel: t("actions.cancel"),
				onClick: onCancel,
				testId: "mobile-recording-rename-cancel",
			}}
			headerTrailingAction={{
				icon: <Check />,
				ariaLabel: t("actions.confirm"),
				onClick: onConfirm,
				disabled: renaming || !value.trim(),
				tone: "primary",
				testId: "mobile-recording-rename-confirm",
			}}
			className="flex flex-col overflow-hidden rounded-t-2xl border-0 bg-muted p-0"
			bodyClassName="no-scrollbar flex flex-col gap-2 overflow-y-auto px-[14px] pb-6 pt-[10px]"
			style={{ boxShadow: "0 -14px 44px rgba(0,0,0,0.18)" }}
			data-testid="mobile-recording-rename-dialog"
		>
			<form className="flex flex-col gap-2" onSubmit={handleSubmit}>
				<div className="flex flex-col gap-2">
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("actions.renameLabel")}
					</p>
					<div className="overflow-hidden rounded-lg bg-card">
						<input
							ref={inputRef}
							type="text"
							value={value}
							onChange={(event) => onValueChange(event.target.value)}
							placeholder={t("actions.renamePlaceholder")}
							autoComplete="off"
							autoCorrect="off"
							spellCheck={false}
							className="h-12 w-full border-0 bg-transparent px-[14px] py-0 text-[16px] leading-6 text-foreground outline-none"
							data-testid="mobile-recording-title-input"
						/>
					</div>
				</div>
			</form>
		</MagicPopup>
	)
}

/** Bottom sheet for editing all active speaker names in one commit. */
function MobileRecordingSpeakerSheet({
	isOpen,
	speakerIds,
	value,
	onValueChange,
	onCancel,
	onConfirm,
}: {
	isOpen: boolean
	speakerIds: string[]
	value: Record<string, string>
	onValueChange: (next: Record<string, string>) => void
	onCancel: () => void
	onConfirm: () => void
}) {
	const { t } = useTranslation("audioRecordings")

	return (
		<MagicPopup
			visible={isOpen}
			onClose={onCancel}
			position="bottom"
			title={t("detail.speakerSettingsTitle")}
			headerVariant="actionHeader"
			headerTitle={t("detail.speakerSettingsTitle")}
			headerLeadingAction={{
				icon: <X />,
				ariaLabel: t("detail.speakerSettingsCancel"),
				onClick: onCancel,
				testId: "mobile-recording-speaker-cancel",
			}}
			headerTrailingAction={{
				icon: <Check />,
				ariaLabel: t("detail.speakerSettingsSave"),
				onClick: onConfirm,
				tone: "primary",
				testId: "mobile-recording-speaker-confirm",
			}}
			className="flex flex-col overflow-hidden rounded-t-2xl border-0 bg-muted p-0"
			bodyClassName="no-scrollbar flex flex-col overflow-y-auto px-[14px] pb-6 pt-[10px]"
			style={{ boxShadow: "0 -14px 44px rgba(0,0,0,0.18)" }}
			data-testid="mobile-recording-speaker-sheet"
		>
			<div className="flex max-h-[min(52dvh,calc(85dvh-11rem))] flex-col overflow-y-auto overflow-x-hidden">
				<p className="shrink-0 px-[14px] pb-2 text-[14px] leading-5 text-muted-foreground">
					{t("detail.speakerSettingsHint")}
				</p>
				<div className="flex flex-col gap-3 pb-2">
					{speakerIds.map((speakerId, index) => (
						<div key={speakerId} className="flex flex-col gap-2">
							<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
								{t("detail.speakerLabel", {
									label: buildSpeakerAlphaLabel(index),
								})}
							</p>
							<div className="overflow-hidden rounded-lg bg-card">
								<input
									type="text"
									value={value[speakerId] ?? speakerId}
									onChange={(event) =>
										onValueChange({
											...value,
											[speakerId]: event.target.value,
										})
									}
									placeholder={speakerId}
									autoComplete="off"
									autoCorrect="off"
									spellCheck={false}
									className="h-12 w-full border-0 bg-transparent px-[14px] py-0 text-[16px] leading-6 text-foreground outline-none"
								/>
							</div>
						</div>
					))}
				</div>
			</div>
		</MagicPopup>
	)
}

/** Builds simple A/B/C labels matching the prototype speaker sheet. */
function buildSpeakerAlphaLabel(index: number) {
	return String.fromCharCode("A".charCodeAt(0) + index)
}

/** Collects every speaker id from loaded detail text files for the shared editor. */
function collectRecordingSpeakerIds(contents: Array<string | undefined>) {
	return Array.from(
		new Set(contents.flatMap((content) => (content ? collectSpeakerIdsFromText(content) : []))),
	)
}
