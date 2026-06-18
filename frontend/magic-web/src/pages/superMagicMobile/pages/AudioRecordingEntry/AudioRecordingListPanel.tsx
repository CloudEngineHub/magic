import type { ComponentType, ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { InfiniteScroll } from "antd-mobile"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { AudioProjectListItem } from "@/types/audioProject"
import MagicPullToRefresh from "@/components/base-mobile/MagicPullToRefresh"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import ProjectShareSheet from "@/pages/superMagicMobile/components/ProjectShareSheet"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import { MobileResourceListSkeletonList } from "@/pages/superMagicMobile/components/skeletons"
import {
	isAudioProjectPreviewReady,
	resolveRecordingDisplayName,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"
import { UNGROUPED_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import { SuperMagicApi } from "@/apis"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import { useMobileAudioRecordingsList } from "./hooks/useMobileAudioRecordingsList"
import { MobileRecordingCard } from "./components/MobileRecordingCard"
import { MobileRecordingFab } from "./components/MobileRecordingFab"
import { MobileRecordingFilterSheet } from "./components/MobileRecordingFilterSheet"
import { MobileRecordingGroupSheet } from "./components/MobileRecordingGroupSheet"
import { MobileRecordingImportSheet } from "./components/MobileRecordingImportSheet"
import { MobileRecordingListToolbar } from "./components/MobileRecordingListToolbar"
import { MobileRecordingMoveGroupSheet } from "./components/MobileRecordingMoveGroupSheet"
import { MobileRecordingMoreSheet } from "./components/MobileRecordingMoreSheet"
import { MobileActiveRecordingCard } from "./components/MobileActiveRecordingCard"
import { MobileActiveRecordingIndicator } from "./components/MobileActiveRecordingIndicator"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import recordingSummaryStore from "@/stores/recordingSummary"

/**
 * Mobile recordings list panel: toolbar, pull-to-refresh list, sheets, and FAB placeholder.
 * Data layer reuses PC AudioRecordingsStore scoped to this panel's lifecycle.
 */
interface AudioRecordingListPanelProps {
	isSessionActive?: boolean
	sessionTitle?: string
	sessionDuration?: string
	isSessionPaused?: boolean
	isSessionBusy?: boolean
	onResumeRecording?: () => void
	onStartRecording?: () => void
	onPauseRecording?: () => void
	onContinueRecording?: () => void
	onFinishRecording?: () => void
	WaveformComponent?: ComponentType<{ isRecording: boolean; isPaused: boolean }>
	optimisticItems?: AudioProjectListItem[]
	refreshToken?: number
	onImportFiles?: (files: FileList) => void
	isImporting?: boolean
	onResolveOptimisticItem?: (projectId: string) => void
	AudioUploadActionComponent?: ComponentType<{
		handler: (onUpload: () => void) => ReactNode
		onFileChange?: (files: FileList) => void
	}>
	onRetryUpload?: (projectId: string) => Promise<void>
	isOtherTabRecording?: boolean
}

interface ShareSheetState {
	projectId: string
	projectName: string
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
}

function shouldKeepOptimisticDurationFallback(
	authoritativeItem: AudioProjectListItem,
	optimisticItem: AudioProjectListItem,
): boolean {
	return (
		authoritativeItem.card_status === "summarizing" &&
		(authoritativeItem.duration ?? 0) <= 0 &&
		(optimisticItem.duration ?? 0) > 0
	)
}

function mergeAudioRecordingItems(
	authoritativeItem: AudioProjectListItem,
	optimisticItem?: AudioProjectListItem,
): AudioProjectListItem {
	if (!optimisticItem) return authoritativeItem

	// If the optimistic item is currently uploading or has failed upload, preserve the upload state.
	// This ensures that the upload progress bar and controls remain visible even if the backend list
	// returns a preliminary record (e.g. not_summarized) for this project.
	const isUploading =
		optimisticItem.card_status === "uploading" ||
		optimisticItem.card_status === "upload_failed" ||
		optimisticItem.transferStatus === "transferring" ||
		optimisticItem.transferStatus === "failed"

	if (isUploading) {
		return {
			...authoritativeItem,
			card_status: optimisticItem.card_status,
			transferStatus: optimisticItem.transferStatus,
			transferProgress: optimisticItem.transferProgress,
			duration: optimisticItem.duration ?? authoritativeItem.duration,
		}
	}

	if (!shouldKeepOptimisticDurationFallback(authoritativeItem, optimisticItem)) {
		return authoritativeItem
	}

	// The backend row is still authoritative for status and navigation fields, but
	// freshly recorded items can keep the local session duration until merge finishes.
	return {
		...authoritativeItem,
		duration: optimisticItem.duration,
	}
}

function AudioRecordingListPanel({
	isSessionActive = false,
	sessionTitle = "",
	sessionDuration = "00:00:00",
	isSessionPaused = false,
	isSessionBusy = false,
	onResumeRecording,
	onStartRecording,
	onPauseRecording,
	onContinueRecording,
	onFinishRecording,
	WaveformComponent,
	optimisticItems: propsOptimisticItems = [],
	refreshToken = 0,
	onImportFiles,
	isImporting = false,
	onResolveOptimisticItem,
	AudioUploadActionComponent,
	onRetryUpload,
	isOtherTabRecording = false,
}: AudioRecordingListPanelProps) {
	const { t } = useTranslation(["audioRecordings", "super"])
	const navigate = useNavigate()
	const [shareSheetState, setShareSheetState] = useState<ShareSheetState | null>(null)
	const [isActiveCardVisible, setIsActiveCardVisible] = useState(true)
	const [activeRecordingCardElement, setActiveRecordingCardElement] =
		useState<HTMLDivElement | null>(null)
	const {
		store,
		searchKeyword,
		setSearchKeyword,
		setIsSearchComposing,
		searchOpen,
		filterState,
		filterSheetOpen,
		setFilterSheetOpen,
		importSheetOpen,
		setImportSheetOpen,
		groupSheetOpen,
		setGroupSheetOpen,
		moveGroupSheetOpen,
		setMoveGroupSheetOpen,
		moveTarget,
		groups,
		totalGroupCount,
		ungroupedCount,
		currentGroupId,
		currentGroupLabel,
		currentGroupCount,
		groupActionSubmitting,
		activeFilterCount,
		debouncedKeyword,
		moreTarget,
		handleRefresh,
		handleLoadMore,
		handleSummaryFilterChange,
		handleFilterStateChange,
		handleOpenSearch,
		handleDismissSearch,
		handleOpenMore,
		handleCloseMore,
		handleGroupChange,
		handleCreateGroup,
		handleRenameGroup,
		handleDeleteGroup,
		handleOpenMoveGroup,
		handleMoveGroupChange,
		refreshGroups,
	} = useMobileAudioRecordingsList()

	// Prioritize store.optimisticItems to guarantee MobX reactive tracking,
	// falling back to propsOptimisticItems (mainly for unit tests where store is mocked).
	const optimisticItems =
		store.optimisticItems !== undefined ? store.optimisticItems : propsOptimisticItems

	// Directly calculate mergedList on every render to prevent React useMemo from caching
	// outdated array contents when MobX updates property fields of items inside the array.
	const mergedList = (() => {
		const mergedMap = new Map<string, AudioProjectListItem>()

		// Keep optimistic items first so freshly finished recordings appear instantly.
		for (const item of optimisticItems) {
			mergedMap.set(item.id, item)
		}
		for (const item of store.list) {
			mergedMap.set(item.id, mergeAudioRecordingItems(item, mergedMap.get(item.id)))
		}

		return Array.from(mergedMap.values())
	})()

	const showInitialSkeleton = store.showInitialSkeleton
	const isEmpty = !showInitialSkeleton && mergedList.length === 0
	const isSearchEmpty = isEmpty && debouncedKeyword.trim().length > 0
	const shouldStretchPullToRefresh = !showInitialSkeleton && (isEmpty || isSearchEmpty)

	/**
	 * Re-syncs the list after a recording is completed so the optimistic card can
	 * later be replaced by the authoritative backend row.
	 */
	useEffect(() => {
		if (!refreshToken) return
		void handleRefresh()
	}, [handleRefresh, refreshToken])

	// Serialize array properties to static strings so react-hooks/exhaustive-deps lint check passes
	// and React correctly detects item state changes without triggering warnings.
	const optimisticItemsStatusStr = optimisticItems
		.map((item) => `${item.id}-${item.card_status}-${item.duration}`)
		.join(",")
	const authoritativeItemsStatusStr = store.list
		.map((item) => `${item.id}-${item.card_status}-${item.duration}`)
		.join(",")
	const optimisticItemsIdsStr = optimisticItems.map((item) => item.id).join(",")
	const authoritativeItemsIdsStr = store.list.map((item) => item.id).join(",")

	// Detect when authoritative list catches up with the optimistic uploads and resolves them.
	// We serialize id, status, and duration into the dependency list to force execution on property updates.
	useEffect(() => {
		if (!optimisticItems.length) return

		const hydratedIds = optimisticItems
			.map((item) => item.id)
			.filter((projectId) => {
				const optimisticItem = optimisticItems.find((item) => item.id === projectId)
				const authoritativeItem = store.list.find((entry) => entry.id === projectId)
				if (!optimisticItem || !authoritativeItem) return false

				return !shouldKeepOptimisticDurationFallback(authoritativeItem, optimisticItem)
			})

		if (!hydratedIds.length) return

		hydratedIds.forEach((projectId) => {
			onResolveOptimisticItem?.(projectId)
		})
	}, [
		onResolveOptimisticItem,
		optimisticItems,
		store.list,
		optimisticItemsStatusStr,
		authoritativeItemsStatusStr,
	])

	// Poll backend for items that exist in optimistic array but are not yet saved to store.list.
	// Dependency array checks for id list changes to establish or clear the fetch interval.
	useEffect(() => {
		if (!optimisticItems.length) return

		const unresolvedItems = optimisticItems.filter(
			(item) => !store.list.some((entry) => entry.id === item.id),
		)
		if (!unresolvedItems.length) return

		const timer = window.setInterval(() => {
			void handleRefresh()
		}, 5000)

		return () => {
			window.clearInterval(timer)
		}
	}, [
		handleRefresh,
		optimisticItems,
		store.list,
		optimisticItemsIdsStr,
		authoritativeItemsIdsStr,
	])

	/**
	 * Mirrors the prototype behavior: once the active recording card scrolls out
	 * of view, promote a floating indicator so users can jump back immediately.
	 */
	useEffect(() => {
		if (!isSessionActive) {
			setIsActiveCardVisible(true)
			return
		}

		if (!WaveformComponent) {
			setIsActiveCardVisible(true)
			return
		}

		if (typeof IntersectionObserver === "undefined") {
			setIsActiveCardVisible(true)
			return
		}

		const target = activeRecordingCardElement
		if (!target) {
			setIsActiveCardVisible(true)
			return
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsActiveCardVisible(entry?.isIntersecting ?? true)
			},
			{ threshold: 0.1 },
		)

		observer.observe(target)

		return () => {
			observer.disconnect()
			setIsActiveCardVisible(true)
		}
	}, [WaveformComponent, activeRecordingCardElement, isSessionActive])

	useEffect(() => {
		// Keep global FloatPanel suppression in sync with list-page card visibility.
		recordingSummaryStore.floatPanel.setExternallyHidden(isSessionActive && isActiveCardVisible)

		return () => {
			recordingSummaryStore.floatPanel.setExternallyHidden(false)
			// When the user navigates away from the recordings list while a session is
			// active, collapse the legacy FloatPanel so it appears as the small
			// floating capsule on other pages rather than as a pre-opened bottom sheet.
			if (isSessionActive) {
				recordingSummaryStore.floatPanel.setExpanded(false)
			}
		}
	}, [isActiveCardVisible, isSessionActive])

	function handleOpenDetail(item: AudioProjectListItem) {
		if (!isAudioProjectPreviewReady(item)) return

		navigate({
			name: RouteName.AudioRecordingDetail,
			params: { projectId: item.id },
			state: {
				projectName: resolveRecordingDisplayName(item.project_name, item.created_at),
				cardStatus: item.card_status,
				audioFileId: item.audio_file_id,
			},
		})
	}

	async function handleSummarize(item: AudioProjectListItem) {
		const result = await store.submitSummary(item)
		if (result.ok) return true

		if (result.reason === "missingParams") {
			toast.error(t("audioRecordings:summary.missingParams"))
			return false
		}
		if (result.reason === "missingModel") {
			toast.error(t("audioRecordings:summary.missingModel"))
			return false
		}
		if (result.reason === "api") {
			toast.error(t("audioRecordings:summary.submitFailed"))
			return false
		}
		return false
	}

	async function handleRename(projectId: string, name: string) {
		const success = await store.renameProject(projectId, name)
		if (success) {
			toast.success(t("audioRecordings:actions.renameSuccess"))
			return true
		}
		toast.error(t("audioRecordings:actions.renameFailed"))
		return false
	}

	async function handleDelete(projectId: string) {
		const success = await store.deleteProject(projectId)
		if (success) {
			onResolveOptimisticItem?.(projectId)
			toast.success(t("audioRecordings:actions.deleteSuccess"))
			void refreshGroups()
			return true
		}
		toast.error(t("audioRecordings:actions.deleteFailed"))
		return false
	}

	async function handleMoveToGroup(groupId: string) {
		const success = await handleMoveGroupChange(groupId)
		if (success) {
			toast.success(t("super:mobile.recordingEntry.groupSheet.moveSuccess"))
			return
		}
		toast.error(t("super:mobile.recordingEntry.groupSheet.moveFailed"))
	}

	/**
	 * Loads the target project's attachments on demand so the list-page share action
	 * can reuse the same mobile project-share sheet as the detail page.
	 */
	async function handleShareProject() {
		if (!moreTarget?.id) return

		try {
			const response = await SuperMagicApi.getAttachmentsByProjectId({
				projectId: moreTarget.id,
				temporaryToken: "",
			})
			const processed = AttachmentDataProcessor.processAttachmentData(response)

			setShareSheetState({
				projectId: moreTarget.id,
				projectName: resolveRecordingDisplayName(
					moreTarget.project_name,
					moreTarget.created_at,
				),
				attachments: processed.tree,
				attachmentList: processed.list,
			})
		} catch {
			toast.error(t("audioRecordings:detail.loadFailed"))
		}
	}

	return (
		<div
			className="relative flex min-h-0 flex-1 flex-col"
			data-testid="mobile-audio-recording-list-panel"
		>
			<ScrollEdgeFadeContainer
				fadeColor="mobile-background"
				className="min-h-0 flex-1"
				contentDeps={[
					store.list.length,
					showInitialSkeleton,
					store.summaryFilter,
					filterState,
				]}
			>
				<MagicPullToRefresh
					embedInParentScroll
					onRefresh={handleRefresh}
					containerClassName={
						shouldStretchPullToRefresh
							? "relative min-h-0 flex-1 [&_.adm-pull-to-refresh]:flex [&_.adm-pull-to-refresh]:h-full [&_.adm-pull-to-refresh]:min-h-0 [&_.adm-pull-to-refresh]:flex-col [&_.adm-pull-to-refresh-content]:flex [&_.adm-pull-to-refresh-content]:min-h-0 [&_.adm-pull-to-refresh-content]:flex-1 [&_.adm-pull-to-refresh-content]:flex-col"
							: "relative min-h-0 flex-1"
					}
					showSuccessMessage={false}
				>
					<div className="flex min-h-full flex-col gap-2.5 px-3 pb-20 pt-4">
						{showInitialSkeleton ? (
							<MobileResourceListSkeletonList testId="mobile-recording-list-skeleton" />
						) : (
							<>
								{/* Active Recording Card shown ABOVE the toolbar row */}
								{isSessionActive && !isOtherTabRecording && WaveformComponent ? (
									<div ref={setActiveRecordingCardElement}>
										<MobileActiveRecordingCard
											title={sessionTitle}
											duration={sessionDuration}
											isPaused={isSessionPaused}
											isBusy={isSessionBusy}
											onOpen={() => onResumeRecording?.()}
											onPause={() => onPauseRecording?.()}
											onResume={() => onContinueRecording?.()}
											onFinish={() => onFinishRecording?.()}
										/>
									</div>
								) : null}

								{/* Toolbar row (Filter, Search, Upload, Group Picker) */}
								<MobileRecordingListToolbar
									groupLabel={currentGroupLabel}
									groupCount={currentGroupCount}
									activeFilterCount={activeFilterCount}
									searchOpen={searchOpen}
									searchKeyword={searchKeyword}
									onSearchKeywordChange={setSearchKeyword}
									onSearchCompositionStart={() => setIsSearchComposing(true)}
									onSearchCompositionEnd={() => setIsSearchComposing(false)}
									onOpenSearch={handleOpenSearch}
									onDismissSearch={handleDismissSearch}
									onOpenGroupSheet={() => setGroupSheetOpen(true)}
									onOpenFilterSheet={() => setFilterSheetOpen(true)}
									onOpenImportSheet={() => setImportSheetOpen(true)}
								/>

								{/* Data area (Empty states or the list of recording cards) */}
								{isSearchEmpty ? (
									<DataEmptyState variant="search" className="flex-1" />
								) : isEmpty ? (
									<DataEmptyState variant="recording" className="flex-1" />
								) : (
									<div
										className="flex flex-col gap-2.5"
										data-testid="mobile-recording-card-list"
									>
										{mergedList.map((item) => (
											<MobileRecordingCard
												key={item.id}
												item={item}
												onOpen={handleOpenDetail}
												onSummarize={(entry) => void handleSummarize(entry)}
												onMore={handleOpenMore}
												onRetry={(entry) => void onRetryUpload?.(entry.id)}
												isSubmitting={store.isSubmittingSummary(item.id)}
											/>
										))}
									</div>
								)}

								{/* Infinite scroll pagination */}
								{mergedList.length > 0 ? (
									<InfiniteScroll
										loadMore={handleLoadMore}
										hasMore={store.hasMore}
										threshold={120}
									/>
								) : null}
							</>
						)}
					</div>
				</MagicPullToRefresh>
			</ScrollEdgeFadeContainer>

			<MobileRecordingFab hidden={isSessionActive} onClick={() => onStartRecording?.()} />

			<MobileActiveRecordingIndicator
				hidden={!isSessionActive || isOtherTabRecording || isActiveCardVisible}
				duration={sessionDuration}
				isPaused={isSessionPaused}
				onOpen={() => onResumeRecording?.()}
			/>

			<MobileRecordingFilterSheet
				open={filterSheetOpen}
				onOpenChange={setFilterSheetOpen}
				filter={filterState}
				summaryFilter={store.summaryFilter}
				onChange={handleFilterStateChange}
				onSummaryFilterChange={handleSummaryFilterChange}
			/>

			<MobileRecordingGroupSheet
				open={groupSheetOpen}
				onOpenChange={setGroupSheetOpen}
				groups={groups}
				selectedGroupId={currentGroupId}
				totalCount={totalGroupCount}
				ungroupedCount={ungroupedCount}
				onSelect={handleGroupChange}
				onCreateGroup={handleCreateGroup}
				onRenameGroup={handleRenameGroup}
				onDeleteGroup={handleDeleteGroup}
				isSubmitting={groupActionSubmitting}
			/>

			{AudioUploadActionComponent ? (
				<MobileRecordingImportSheet
					open={importSheetOpen}
					onOpenChange={setImportSheetOpen}
					onImportFiles={(files) => onImportFiles?.(files)}
					isImporting={isImporting}
					AudioUploadActionComponent={AudioUploadActionComponent}
				/>
			) : null}

			<MobileRecordingMoreSheet
				isOpen={moreTarget != null}
				item={moreTarget}
				onClose={handleCloseMore}
				onRename={handleRename}
				onDelete={handleDelete}
				onSummarize={handleSummarize}
				onMoveToGroup={handleOpenMoveGroup}
				onShare={() => {
					void handleShareProject()
				}}
				isSubmittingAction={moreTarget != null && store.isSubmittingAction(moreTarget.id)}
				isSubmittingSummary={moreTarget != null && store.isSubmittingSummary(moreTarget.id)}
				showRegenerateAction
			/>

			<MobileRecordingMoveGroupSheet
				open={moveGroupSheetOpen}
				onOpenChange={setMoveGroupSheetOpen}
				groups={groups}
				selectedGroupId={moveTarget?.workspace_id ?? UNGROUPED_RECORDING_GROUP_ID}
				ungroupedCount={ungroupedCount}
				onSelect={(groupId) => void handleMoveToGroup(groupId)}
			/>

			<ProjectShareSheet
				open={shareSheetState != null}
				onClose={() => setShareSheetState(null)}
				projectId={shareSheetState?.projectId}
				projectName={shareSheetState?.projectName}
				attachments={shareSheetState?.attachments ?? []}
				attachmentList={shareSheetState?.attachmentList ?? []}
			/>
		</div>
	)
}

export default observer(AudioRecordingListPanel)
