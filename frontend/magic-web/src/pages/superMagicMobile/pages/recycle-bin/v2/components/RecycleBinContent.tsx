import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { observer } from "mobx-react-lite"
import { InfiniteScroll } from "antd-mobile"
import { X, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { MobileResourceListSkeletonList } from "@/pages/superMagicMobile/components/skeletons"
import { Sheet, SheetContent, SheetTitle } from "@/components/shadcn-ui/sheet"
import CrossProjectFileOperationModal from "@/pages/superMagic/components/SelectPathModal/components/CrossProjectFileOperationModal"
import MoveProjectModal from "@/pages/superMagic/components/EmptyWorkspacePanel/components/MoveProjectModal"
import { projectStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import RecycleBinItem from "./RecycleBinItem"
import RecycleBinOrphanWarnSheet from "./RecycleBinOrphanWarnSheet"
import MobileTrashRestorePickerSheet from "./MobileTrashRestorePickerSheet"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import { useMobileRecycleBinList } from "../hooks/useMobileRecycleBinList"
import { useMobileRecycleBinSelection } from "../hooks/useMobileRecycleBinSelection"
import { useMobileRecycleBinRestoreFlow } from "../hooks/useMobileRecycleBinRestoreFlow"
import TrashSelectionBar from "./TrashSelectionBar"

interface RecycleBinContentProps {
	activeTab?: string
	searchValue?: string
	order?: "desc" | "asc"
	onTabCountChange?: (tabId: string, count: number) => void
	onSelectionStateChange?: (hasSelection: boolean) => void
	onEmptyStateChange?: (shouldStretch: boolean) => void
	/** 外部触发刷新的信号计数器，值每次变化时组件重新加载第 1 页数据 */
	refreshSignal?: number
}

function RecycleBinContent(props: RecycleBinContentProps) {
	const {
		activeTab = "all",
		searchValue = "",
		order = "desc",
		onTabCountChange,
		onSelectionStateChange,
		onEmptyStateChange,
		refreshSignal,
	} = props
	const { t } = useTranslation("super")
	const [applySameActionToRemaining, setApplySameActionToRemaining] = useState(false)

	const {
		items,
		setItems,
		filteredItems,
		loading,
		hasError,
		queryParams,
		run,
		debouncedSearchValue,
		hasMore,
		loadMore,
	} = useMobileRecycleBinList({
		activeTab,
		searchValue,
		order,
		onTabCountChange,
	})

	const {
		selectedIds,
		setSelectedIds,
		selectedCount,
		isAllSelected,
		handleSelectionChange,
		handleSelectAll,
		handleDeselectAll,
	} = useMobileRecycleBinSelection(filteredItems, activeTab)

	const selectionBarMount =
		typeof document !== "undefined"
			? document.getElementById("mobile-recycle-bin-selection-mount")
			: null

	useEffect(() => {
		onSelectionStateChange?.(selectedCount > 0)
	}, [selectedCount, onSelectionStateChange])

	useEffect(() => {
		setSelectedIds((prev) => prev.filter((id) => items.some((i) => i.id === id)))
	}, [items, setSelectedIds])

	/** refreshSignal 每次变化时重新加载第 1 页，被 MobileRecycleBinPanel 的下拉刷新触发。*/
	const prevRefreshSignalRef = useRef(refreshSignal)
	useEffect(() => {
		if (prevRefreshSignalRef.current !== refreshSignal) {
			prevRefreshSignalRef.current = refreshSignal
			run(queryParams)
		}
	}, [refreshSignal, run, queryParams])

	const restoreFlow = useMobileRecycleBinRestoreFlow({
		items,
		setItems,
		selectedIds,
		setSelectedIds,
		queryParams,
		run,
	})

	useEffect(() => {
		if (!restoreFlow.pendingNameConflictResolveOpen) {
			setApplySameActionToRemaining(false)
		}
	}, [restoreFlow.pendingNameConflictResolveOpen, restoreFlow.pendingNameConflictFileName])

	useEffect(() => {
		if (
			!restoreFlow.selectPathModalOpen &&
			!restoreFlow.moveProjectModalOpen &&
			!restoreFlow.restorePickerOpen
		)
			return
		SuperMagicService.workspace
			.fetchWorkspaces({
				page: 1,
				isAutoSelect: false,
				isSelectLast: false,
			})
			.catch((error) => console.error(error))
	}, [
		restoreFlow.selectPathModalOpen,
		restoreFlow.moveProjectModalOpen,
		restoreFlow.restorePickerOpen,
	])

	useEffect(() => {
		if (restoreFlow.selectPathTarget?.type !== "topic" || !restoreFlow.selectPathWorkspaceId)
			return
		projectStore
			.loadProjectsForWorkspace(restoreFlow.selectPathWorkspaceId)
			.catch((error) => console.error(error))
	}, [restoreFlow.selectPathTarget?.type, restoreFlow.selectPathWorkspaceId])

	// Keep project list in sync when restore picker advances to the project step.
	useEffect(() => {
		if (!restoreFlow.restorePickerOpen || !restoreFlow.restorePickerWorkspaceId) return
		projectStore
			.loadProjectsForWorkspace(restoreFlow.restorePickerWorkspaceId)
			.catch((error) => console.error(error))
	}, [restoreFlow.restorePickerOpen, restoreFlow.restorePickerWorkspaceId])

	const hasItems = filteredItems.length > 0
	const isSearchActive = debouncedSearchValue.length > 0
	const shouldStretchEmptyState =
		!loading && ((items.length === 0 && isSearchActive) || items.length === 0 || !hasItems)
	const restoreConfirmLines = restoreFlow.restoreConfirmMessage
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

	useEffect(() => {
		onEmptyStateChange?.(shouldStretchEmptyState)
		return () => onEmptyStateChange?.(false)
	}, [onEmptyStateChange, shouldStretchEmptyState])

	if (loading && items.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col px-3 py-2"
				data-testid="mobile-recycle-bin-content"
			>
				<MobileResourceListSkeletonList testId="mobile-recycle-bin-loading-skeleton" />
			</div>
		)
	}

	if (hasError && items.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-12"
				data-testid="mobile-recycle-bin-content"
			>
				<div className="text-sm text-muted-foreground">
					{t("recycleBin.error.loadFailed")}
				</div>
				<Button variant="outline" size="sm" onClick={() => run(queryParams)}>
					{t("recycleBin.error.retry")}
				</Button>
			</div>
		)
	}

	if (!loading && items.length === 0 && isSearchActive) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center"
				data-testid="mobile-recycle-bin-content"
			>
				<DataEmptyState
					variant="search"
					className="flex-1"
					testId="mobile-recycle-bin-search-empty"
				/>
			</div>
		)
	}

	if (!loading && items.length === 0) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center"
				data-testid="mobile-recycle-bin-content"
			>
				<DataEmptyState
					variant="trash"
					className="flex-1"
					testId="mobile-recycle-bin-empty"
				/>
			</div>
		)
	}

	if (!hasItems) {
		return (
			<div
				className="flex min-h-0 flex-1 flex-col items-center justify-center"
				data-testid="mobile-recycle-bin-content"
			>
				<DataEmptyState
					variant="search"
					className="flex-1"
					testId="mobile-recycle-bin-tab-empty"
				/>
			</div>
		)
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-recycle-bin-content">
			<div className="flex flex-col gap-1 pb-1">
				{filteredItems.map((item) => (
					<RecycleBinItem
						key={item.id}
						item={{
							...item,
							selected: selectedIds.includes(item.id),
						}}
						onSelectionChange={handleSelectionChange}
					/>
				))}

				{/* InfiniteScroll 放在列表末尾，向上滑动到底部时自动加载下一页 */}
				<InfiniteScroll hasMore={hasMore} loadMore={loadMore} />
			</div>

			{selectedCount > 0 && selectionBarMount
				? createPortal(
						<TrashSelectionBar
							visibleTotal={filteredItems.length}
							isAllSelected={isAllSelected}
							onToggleAll={() =>
								isAllSelected ? handleDeselectAll() : handleSelectAll()
							}
							onRestore={() => void restoreFlow.requestRestoreSelection()}
							onPurge={restoreFlow.requestPermanentDelete}
						/>,
						selectionBarMount,
					)
				: null}

			{/* 彻底删除确认 Sheet */}
			<Sheet
				open={restoreFlow.purgeConfirmOpen}
				onOpenChange={(open) => !open && restoreFlow.closePurgeConfirm()}
			>
				<SheetContent
					side="bottom"
					showClose={false}
					aria-describedby={undefined}
					className="flex h-auto flex-col gap-0 overflow-hidden rounded-t-[14px] border-0 bg-muted p-0"
					style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
				>
					<div className="flex w-full shrink-0 flex-col items-center py-[6px]">
						<div className="h-1 w-20 rounded-full bg-muted-foreground/40" aria-hidden />
					</div>

					<div className="mobile-popup-action-header relative flex h-14 w-full shrink-0 items-center justify-center px-16 py-2">
						<button
							type="button"
							onClick={restoreFlow.closePurgeConfirm}
							className="absolute left-[10px] top-1/2 flex size-12 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
							aria-label={t("mobile.recycleBin.purge.cancelAria")}
							data-testid="close-purge-confirm"
						>
							<X className="size-[22px] text-foreground" />
						</button>
						<SheetTitle className="max-w-[247px] truncate text-center text-[18px] font-semibold leading-none text-foreground">
							{restoreFlow.purgeConfirmTitle}
						</SheetTitle>
						<button
							type="button"
							onClick={() => void restoreFlow.confirmPermanentDelete()}
							className="absolute right-[10px] top-1/2 flex size-12 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-destructive shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
							aria-label={t("mobile.recycleBin.purge.confirmAria")}
							data-testid="confirm-permanent-delete"
						>
							<Check className="size-[22px] text-white" />
						</button>
					</div>

					<div className="flex flex-col items-center px-4 pb-12 pt-2">
						<p className="text-center text-[16px] leading-6 text-foreground">
							{restoreFlow.purgeConfirmMessage}
						</p>
					</div>
				</SheetContent>
			</Sheet>

			{/* 恢复确认 Sheet */}
			<Sheet
				open={restoreFlow.restoreConfirmOpen}
				onOpenChange={(open) => !open && restoreFlow.closeRestoreConfirm()}
			>
				<SheetContent
					side="bottom"
					showClose={false}
					aria-describedby={undefined}
					className="flex h-auto flex-col gap-0 overflow-hidden rounded-t-[14px] border-0 bg-muted p-0"
					style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
				>
					<div className="flex w-full shrink-0 flex-col items-center py-[6px]">
						<div className="h-1 w-20 rounded-full bg-muted-foreground/40" aria-hidden />
					</div>

					<div className="mobile-popup-action-header relative flex h-14 w-full shrink-0 items-center justify-center px-16 py-2">
						<button
							type="button"
							onClick={restoreFlow.closeRestoreConfirm}
							className="absolute left-[10px] top-1/2 flex size-12 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
							aria-label={t("mobile.recycleBin.restoreConfirm.cancelAria")}
							data-testid="close-restore-confirm"
						>
							<X className="size-[22px] text-foreground" />
						</button>
						<SheetTitle className="max-w-[247px] truncate text-center text-[18px] font-semibold leading-none text-foreground">
							{restoreFlow.restoreConfirmTitle}
						</SheetTitle>
						<button
							type="button"
							onClick={() => void restoreFlow.confirmRestore()}
							className="absolute right-[10px] top-1/2 flex size-12 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-primary shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
							aria-label={t("mobile.recycleBin.restoreConfirm.confirmAria")}
							data-testid="confirm-restore"
						>
							<Check className="size-[22px] text-primary-foreground" />
						</button>
					</div>

					<div className="flex flex-col items-center px-4 pb-12 pt-2">
						{restoreConfirmLines.length > 1 ? (
							<div className="w-full text-[16px] leading-6 text-foreground">
								<ul className="list-disc space-y-1.5 pl-5 text-left">
									{restoreConfirmLines.map((line) => (
										<li key={line} data-testid="recycle-bin-content-item">{line}</li>
									))}
								</ul>
							</div>
						) : (
							<p className="whitespace-pre-line text-center text-[16px] leading-6 text-foreground">
								{restoreFlow.restoreConfirmMessage}
							</p>
						)}
					</div>
				</SheetContent>
			</Sheet>

			<Sheet
				open={restoreFlow.pendingNameConflictResolveOpen}
				onOpenChange={(open) => !open && restoreFlow.closeNameConflictResolve()}
			>
				<SheetContent
					side="bottom"
					showClose={false}
					aria-describedby={undefined}
					className="flex h-auto flex-col gap-0 overflow-hidden rounded-t-[14px] border-0 bg-muted p-0"
					style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
				>
					<div className="flex w-full shrink-0 flex-col items-center py-[6px]">
						<div className="h-1 w-20 rounded-full bg-muted-foreground/40" aria-hidden />
					</div>

					<div className="mobile-popup-action-header relative flex h-14 w-full shrink-0 items-center justify-center px-16 py-2">
						<button
							type="button"
							onClick={restoreFlow.closeNameConflictResolve}
							className="absolute left-[10px] top-1/2 flex size-12 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-card shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)]"
							aria-label={t("mobile.recycleBin.nameConflictResolve.cancelAria")}
							data-testid="close-name-conflict-resolve"
						>
							<X className="size-[22px] text-foreground" />
						</button>
						<SheetTitle className="max-w-[247px] truncate text-center text-[18px] font-semibold leading-none text-foreground">
							{t("recycleBin.restoreCheck.nameConflictDialogTitle", {
								fileName: restoreFlow.pendingNameConflictFileName,
							})}
						</SheetTitle>
					</div>

					<div className="flex flex-col gap-4 px-4 pb-6 pt-2">
						<p className="text-center text-[16px] leading-6 text-foreground">
							{t("topicFiles.duplicateFile.message", {
								fileName: restoreFlow.pendingNameConflictFileName,
							})}
						</p>
						{restoreFlow.pendingNameConflictCount > 1 ? (
							<label className="flex items-center gap-3" data-testid="recycle-bin-content-label">
								<Checkbox
									checked={applySameActionToRemaining}
									disabled={restoreFlow.isResolvingAllNameConflicts}
									onCheckedChange={(checked) =>
										setApplySameActionToRemaining(checked === true)
									}
									data-testid="mobile-recycle-bin-name-conflict-apply-remaining"
								/>
								<span className="text-[14px] leading-5 text-muted-foreground">
									{t("recycleBin.restoreCheck.applySameActionToRemaining", {
										count: restoreFlow.pendingNameConflictCount - 1,
									})}
								</span>
							</label>
						) : null}
						<div className="flex items-center gap-3">
							<Button
								type="button"
								variant="outline"
								className="h-12 flex-1 rounded-full text-[15px] font-medium"
								onClick={() =>
									void restoreFlow.handleNameConflictSkip(
										applySameActionToRemaining,
									)
								}
								disabled={restoreFlow.isResolvingAllNameConflicts}
								data-testid="mobile-recycle-bin-name-conflict-skip"
							>
								{t("recycleBin.restoreCheck.skipNameConflict")}
							</Button>
							<Button
								type="button"
								className="h-12 flex-1 rounded-full text-[15px] font-medium"
								onClick={() =>
									void restoreFlow.handleNameConflictReplace(
										applySameActionToRemaining,
									)
								}
								disabled={restoreFlow.isResolvingAllNameConflicts}
								data-testid="mobile-recycle-bin-name-conflict-replace"
							>
								{restoreFlow.isResolvingAllNameConflicts
									? t("recycleBin.restoreCheck.processingAllNameConflicts")
									: t("topicFiles.duplicateFile.replace")}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<RecycleBinOrphanWarnSheet
				open={restoreFlow.orphanMixedOpen}
				orphanItems={restoreFlow.orphanMixedItems}
				restorableCount={restoreFlow.orphanMixedRestorableCount}
				onCancel={restoreFlow.closeOrphanMixed}
				onRestoreOthers={() => void restoreFlow.handleOrphanRestoreDirectOnly()}
			/>

			<MobileTrashRestorePickerSheet
				open={restoreFlow.restorePickerOpen}
				itemTitle={restoreFlow.restorePickerItemTitle}
				resourceType={restoreFlow.restorePickerResourceType}
				workspaces={workspaceStore.workspaces}
				projects={restoreFlow.restorePickerProjects}
				isProjectsLoading={
					Boolean(restoreFlow.restorePickerWorkspaceId) &&
					projectStore.isLoadingWorkspace(restoreFlow.restorePickerWorkspaceId)
				}
				onWorkspaceSelect={restoreFlow.handleRestorePickerWorkspaceSelect}
				onClose={restoreFlow.handleRestorePickerClose}
				onConfirm={(payload) => void restoreFlow.handleRestorePickerConfirm(payload)}
			/>

			<MoveProjectModal
				workspaces={workspaceStore.workspaces}
				selectedWorkspace={workspaceStore.selectedWorkspace ?? undefined}
				isMoveProjectLoading={restoreFlow.isMoveProjectLoading}
				fetchWorkspaces={(params) => SuperMagicService.workspace.fetchWorkspaces(params)}
				open={restoreFlow.moveProjectModalOpen}
				onClose={restoreFlow.handleMoveProjectClose}
				onConfirm={restoreFlow.handleMoveProject}
			/>

			{restoreFlow.selectPathTarget && (
				<CrossProjectFileOperationModal
					visible={restoreFlow.selectPathModalOpen}
					title={t("recycleBin.selectPath.title")}
					operationType="move"
					selectedWorkspace={restoreFlow.selectPathSelectedWorkspace}
					selectedProject={restoreFlow.selectPathSelectedProject}
					workspaces={workspaceStore.workspaces}
					fileIds={[]}
					sourceAttachments={[]}
					selectProjectOnly={restoreFlow.selectPathTarget.type === "topic"}
					onClose={restoreFlow.handleSelectPathClose}
					onSubmit={(data) => void restoreFlow.handleSelectPathSubmit(data)}
				/>
			)}
		</div>
	)
}

export default observer(RecycleBinContent)
