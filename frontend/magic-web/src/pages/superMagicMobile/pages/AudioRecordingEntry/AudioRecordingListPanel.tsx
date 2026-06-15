import { observer } from "mobx-react-lite"
import { InfiniteScroll } from "antd-mobile"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import type { AudioProjectListItem } from "@/types/audioProject"
import MagicPullToRefresh from "@/components/base-mobile/MagicPullToRefresh"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import { MobileResourceListSkeletonList } from "@/pages/superMagicMobile/components/skeletons"
import {
	isAudioProjectPreviewReady,
	resolveRecordingDisplayName,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"
import { UNGROUPED_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import { useMobileAudioRecordingsList } from "./hooks/useMobileAudioRecordingsList"
import { MobileRecordingCard } from "./components/MobileRecordingCard"
import { MobileRecordingFab } from "./components/MobileRecordingFab"
import { MobileRecordingFilterSheet } from "./components/MobileRecordingFilterSheet"
import { MobileRecordingGroupSheet } from "./components/MobileRecordingGroupSheet"
import { MobileRecordingImportSheet } from "./components/MobileRecordingImportSheet"
import { MobileRecordingListToolbar } from "./components/MobileRecordingListToolbar"
import { MobileRecordingMoveGroupSheet } from "./components/MobileRecordingMoveGroupSheet"
import { MobileRecordingMoreSheet } from "./components/MobileRecordingMoreSheet"

/**
 * Mobile recordings list panel: toolbar, pull-to-refresh list, sheets, and FAB placeholder.
 * Data layer reuses PC AudioRecordingsStore scoped to this panel's lifecycle.
 */
function AudioRecordingListPanel() {
	const { t } = useTranslation(["audioRecordings", "super"])
	const navigate = useNavigate()
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

	const showInitialSkeleton = store.showInitialSkeleton
	const isEmpty = !showInitialSkeleton && store.isEmpty
	const isSearchEmpty = isEmpty && debouncedKeyword.trim().length > 0
	const shouldStretchPullToRefresh = !showInitialSkeleton && (isEmpty || isSearchEmpty)

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

	return (
		<div
			className="relative flex min-h-0 flex-1 flex-col"
			data-testid="mobile-audio-recording-list-panel"
		>
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
					<div className="flex min-h-full flex-col px-3 pb-20 pt-4">
						{showInitialSkeleton ? (
							<MobileResourceListSkeletonList testId="mobile-recording-list-skeleton" />
						) : null}

						{!showInitialSkeleton && isSearchEmpty ? (
							<DataEmptyState variant="search" className="flex-1" />
						) : null}

						{!showInitialSkeleton && isEmpty && !isSearchEmpty ? (
							<DataEmptyState variant="recording" className="flex-1" />
						) : null}

						{!showInitialSkeleton && store.list.length > 0 ? (
							<div
								className="flex flex-col gap-2.5"
								data-testid="mobile-recording-card-list"
							>
								{store.list.map((item) => (
									<MobileRecordingCard
										key={item.id}
										item={item}
										onOpen={handleOpenDetail}
										onSummarize={(entry) => void handleSummarize(entry)}
										onMore={handleOpenMore}
										isSubmitting={store.isSubmittingSummary(item.id)}
									/>
								))}
							</div>
						) : null}

						{store.list.length > 0 ? (
							<InfiniteScroll
								loadMore={handleLoadMore}
								hasMore={store.hasMore}
								threshold={120}
							/>
						) : null}
					</div>
				</MagicPullToRefresh>
			</ScrollEdgeFadeContainer>

			<MobileRecordingFab />

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

			<MobileRecordingImportSheet open={importSheetOpen} onOpenChange={setImportSheetOpen} />

			<MobileRecordingMoreSheet
				isOpen={moreTarget != null}
				item={moreTarget}
				onClose={handleCloseMore}
				onRename={handleRename}
				onDelete={handleDelete}
				onSummarize={handleSummarize}
				onMoveToGroup={handleOpenMoveGroup}
				isSubmittingAction={moreTarget != null && store.isSubmittingAction(moreTarget.id)}
				isSubmittingSummary={moreTarget != null && store.isSubmittingSummary(moreTarget.id)}
			/>

			<MobileRecordingMoveGroupSheet
				open={moveGroupSheetOpen}
				onOpenChange={setMoveGroupSheetOpen}
				groups={groups}
				selectedGroupId={moveTarget?.workspace_id ?? UNGROUPED_RECORDING_GROUP_ID}
				ungroupedCount={ungroupedCount}
				onSelect={(groupId) => void handleMoveToGroup(groupId)}
			/>
		</div>
	)
}

export default observer(AudioRecordingListPanel)
