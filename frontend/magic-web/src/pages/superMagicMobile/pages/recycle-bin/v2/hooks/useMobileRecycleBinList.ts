import { useEffect, useMemo, useState } from "react"
import type { TFunction } from "i18next"
import { useDebounce, useMemoizedFn, useRequest } from "ahooks"
import { useTranslation } from "react-i18next"
import { RecycleBinApi } from "@/apis"
import {
	createRecycleBinTabCounts,
	RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID,
} from "@/pages/recycleBin/tab-config"
import { getResourceTypeByTabId } from "@/pages/recycleBin/components/recycle-bin-domain"
import type { RecycleBinItemData } from "../components/RecycleBinItem"
import { mapListItemToItemData } from "./mobileRecycleBinMappers"

const RECYCLE_BIN_PAGE_SIZE = 50

export function useMobileRecycleBinList(props: {
	activeTab: string
	searchValue: string
	order?: "desc" | "asc"
	onTabCountChange?: (tabId: string, count: number) => void
}) {
	const { activeTab, searchValue, order = "desc", onTabCountChange } = props
	const { t } = useTranslation("super")
	// 回收站列表按接口关键字查询，统一使用防抖关键字减少移动端重复请求。
	const debouncedSearchValue = useDebounce(searchValue.trim(), { wait: 300 })

	const queryParams = useMemo(() => {
		const resourceType = getResourceTypeByTabId(activeTab)
		return {
			...(resourceType ? { resource_type: resourceType } : {}),
			keyword: debouncedSearchValue || undefined,
			order,
			page: 1,
			page_size: RECYCLE_BIN_PAGE_SIZE,
		}
	}, [activeTab, debouncedSearchValue, order])

	const [items, setItems] = useState<RecycleBinItemData[]>([])
	const [hasError, setHasError] = useState(false)
	const [total, setTotal] = useState(0)
	const [currentPage, setCurrentPage] = useState(1)
	const [isLoadingMore, setIsLoadingMore] = useState(false)

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
		onBefore: () => setHasError(false),
		onSuccess: (data) => {
			const nextItems = data.list.map((item) => mapListItemToItemData(item, t as TFunction))
			setItems(nextItems)
			setTotal(data.total ?? nextItems.length)
			setCurrentPage(1)
			refreshTabCounts().catch((error) => console.error(error))
		},
		onError: () => setHasError(true),
	})

	useEffect(() => {
		run(queryParams)
	}, [queryParams, run])

	useEffect(() => {
		refreshTabCounts().catch((error) => console.error(error))
	}, [refreshTabCounts, queryParams.keyword])

	/**
	 * 加载下一页回收站数据并追加到现有列表。
	 */
	const loadMore = useMemoizedFn(async () => {
		if (isLoadingMore || currentPage * RECYCLE_BIN_PAGE_SIZE >= total) return
		const nextPage = currentPage + 1
		setIsLoadingMore(true)

		try {
			const data = await RecycleBinApi.getRecycleBinList({
				...queryParams,
				page: nextPage,
			})
			const nextItems = data.list.map((item) => mapListItemToItemData(item, t as TFunction))
			setItems((prev) => {
				const existingIds = new Set(prev.map((item) => item.id))
				return [...prev, ...nextItems.filter((item) => !existingIds.has(item.id))]
			})
			setTotal(data.total ?? total)
			setCurrentPage(nextPage)
		} catch (error) {
			console.error("加载更多回收站数据失败:", error)
		} finally {
			setIsLoadingMore(false)
		}
	})

	const hasMore = currentPage * RECYCLE_BIN_PAGE_SIZE < total

	const filteredItems = useMemo(() => {
		if (activeTab === "all") return items
		const targetType = getResourceTypeByTabId(activeTab)
		if (!targetType) return items
		return items.filter((item) => item.resourceType === targetType)
	}, [items, activeTab])

	return {
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
	}
}
