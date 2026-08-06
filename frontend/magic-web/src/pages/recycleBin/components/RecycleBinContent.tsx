import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMemoizedFn, useRequest } from "ahooks"
import { RecycleBinApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import {
	createRecycleBinTabCounts,
	RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID,
	type RecycleBinTab,
	useRecycleBinTabLabel,
} from "../tab-config"
import { RecycleBinList } from "./RecycleBinList"
import { RecycleBinModals } from "./RecycleBinModals"
import { RecycleBinToolbar } from "./RecycleBinToolbar"
import {
	getResourceTypeByTabId,
	mapRecycleBinItem as mapRecycleBinItemFromDomain,
	type RecycleBinItem,
} from "./recycle-bin-domain"
import { useRecycleBinActions } from "./useRecycleBinActions"
import { useRecycleBinSelection } from "./useRecycleBinSelection"

const RECYCLE_BIN_PAGE_SIZE = 50
export function RecycleBinContent({ activeTab, onTabCountChange }: RecycleBinContentProps) {
	const { t } = useTranslation("super")
	const getTabLabel = useRecycleBinTabLabel("pc")
	const [searchValue, setSearchValue] = useState("")
	const [items, setItems] = useState<RecycleBinItem[]>([])
	const [hasError, setHasError] = useState(false)
	const [total, setTotal] = useState(0)
	const [currentPage, setCurrentPage] = useState(1)
	const [isLoadingMore, setIsLoadingMore] = useState(false)

	const activeTabId = activeTab?.id
	const trimmedSearchValue = searchValue.trim()
	const queryParams = useMemo(() => {
		const resourceType = getResourceTypeByTabId(activeTabId)
		return {
			...(resourceType ? { resource_type: resourceType } : {}),
			keyword: trimmedSearchValue ? trimmedSearchValue : undefined,
			order: "desc" as const,
			page: 1,
			page_size: RECYCLE_BIN_PAGE_SIZE,
		}
	}, [activeTabId, trimmedSearchValue])

	const refreshTabCounts = useMemoizedFn(async () => {
		if (!onTabCountChange) return
		const data = await RecycleBinApi.getRecycleBinCounts({
			keyword: queryParams.keyword,
		})
		const nextCounts = createRecycleBinTabCounts()
		data.forEach((item) => {
			const tabId = RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID[item.resource_type]
			if (tabId) nextCounts[tabId] = item.count ?? 0
		})
		nextCounts.all = data.reduce((sum, item) => sum + (item.count ?? 0), 0)
		Object.entries(nextCounts).forEach(([tabId, count]) => {
			onTabCountChange(tabId, count)
		})
	})

	const { run, loading } = useRequest(RecycleBinApi.getRecycleBinList, {
		manual: true,
		onBefore: () => {
			setHasError(false)
		},
		onSuccess: (data) => {
			const nextItems = data.list.map((item) => mapRecycleBinItemFromDomain(item, t))
			setItems(nextItems)
			setTotal(data.total ?? nextItems.length)
			setCurrentPage(1)
			refreshTabCounts().catch((error) => console.error(error))
		},
		onError: () => {
			setHasError(true)
		},
	})

	useEffect(() => {
		run(queryParams)
	}, [queryParams, run])

	useEffect(() => {
		refreshTabCounts().catch((error) => console.error(error))
	}, [refreshTabCounts, queryParams.keyword])

	const loadMore = useMemoizedFn(async () => {
		if (isLoadingMore || currentPage * RECYCLE_BIN_PAGE_SIZE >= total) return
		const nextPage = currentPage + 1
		setIsLoadingMore(true)
		try {
			const data = await RecycleBinApi.getRecycleBinList({
				...queryParams,
				page: nextPage,
			})
			const nextItems = data.list.map((item) => mapRecycleBinItemFromDomain(item, t))
			setItems((prev) => {
				const existingIds = new Set(prev.map((item) => item.id))
				const mergedItems = [
					...prev,
					...nextItems.filter((item) => !existingIds.has(item.id)),
				]
				return mergedItems
			})
			setTotal(data.total ?? total)
			setCurrentPage(nextPage)
		} catch {
			magicToast.error(t("operationFailed"))
		} finally {
			setIsLoadingMore(false)
		}
	})

	const selection = useRecycleBinSelection({
		items,
		activeTabId,
	})
	const actions = useRecycleBinActions({
		items,
		setItems,
		selectedIds: selection.selectedIds,
		hasMixedSelectionTypes: selection.hasMixedSelectionTypes,
		onRefresh: () => {
			run(queryParams)
			refreshTabCounts().catch((error) => console.error(error))
		},
	})

	const hasItems = selection.visibleItems.length > 0
	const shouldShowEmpty = !loading && !hasError && !hasItems
	const title = activeTab ? getTabLabel(activeTab.id, activeTab.count) : ""

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-3.5" data-testid="recycle-bin-content">
			<RecycleBinToolbar
				title={title}
				searchValue={searchValue}
				hasSelection={selection.hasSelection}
				isAllSelected={selection.isAllSelected}
				isPartiallySelected={selection.isPartiallySelected}
				onToggleSelectAll={selection.handleToggleSelectAll}
				onCancelSelection={selection.clearSelection}
				onRestoreSelection={actions.handleRestoreSelected}
				onDeleteSelection={actions.handleDeleteSelected}
				onSearchChange={setSearchValue}
				onSearchReset={() => setSearchValue("")}
				t={t}
			/>

			<div className="flex flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
				<RecycleBinList
					items={selection.visibleItems}
					selectedIds={selection.selectedIds}
					loading={loading}
					loadingMore={isLoadingMore}
					hasMore={currentPage * RECYCLE_BIN_PAGE_SIZE < total}
					hasError={hasError}
					shouldShowEmpty={shouldShowEmpty}
					onLoadMore={loadMore}
					onToggleItem={selection.handleToggleItem}
					onRetry={() => run(queryParams)}
					onOpenRestore={actions.openRestoreModal}
					onOpenDelete={(item) => actions.setDeleteTarget({ kind: "item", item })}
					t={t}
				/>
			</div>

			<RecycleBinModals
				items={items}
				restoreTarget={actions.restoreTarget}
				restoreCheckResult={actions.restoreCheckResult}
				pendingNameConflictRestore={actions.pendingNameConflictRestore}
				deleteTarget={actions.deleteTarget}
				moveProjectModalOpen={actions.moveProjectModalOpen}
				selectPathModalOpen={actions.selectPathModalOpen}
				selectPathTarget={actions.selectPathTarget}
				selectPathSelectedWorkspace={actions.selectPathSelectedWorkspace}
				selectPathSelectedProject={actions.selectPathSelectedProject}
				workspaces={actions.workspaces}
				isMoveProjectLoading={actions.isMoveProjectLoadingCombined}
				isPermanentDeleteLoading={actions.isPermanentDeleteLoading}
				isResolvingAllNameConflicts={actions.isResolvingAllNameConflicts}
				onRestoreOpenChange={actions.handleRestoreModalOpenChange}
				onDeleteOpenChange={actions.handleDeleteModalOpenChange}
				onConfirmRestore={actions.handleConfirmRestore}
				onNameConflictRestoreCancel={actions.handleNameConflictRestoreCancel}
				onNameConflictRestoreReplace={actions.handleNameConflictRestoreReplace}
				onNameConflictRestoreSkip={actions.handleNameConflictRestoreSkip}
				onConfirmDelete={actions.handleConfirmDelete}
				onMoveProjectClose={actions.handleMoveProjectClose}
				onMoveProjectConfirm={actions.handleMoveProject}
				onSelectPathClose={actions.handleSelectPathClose}
				onSelectPathSubmit={actions.handleSelectPathSubmit}
				t={t}
			/>
		</div>
	)
}

interface RecycleBinContentProps {
	activeTab: RecycleBinTab | undefined
	onTabCountChange?: (tabId: string, count: number) => void
}
