import { useCallback, useEffect, useMemo, useRef } from "react"
import useSWRInfinite from "swr/infinite"

import { MagicBaseApi } from "@/apis"
import type {
	MagicBaseQueryRowsResponse,
	MagicBaseRow,
	MagicBaseSortRule,
	MagicBaseTable,
} from "@/apis/modules/magicBase"

import {
	MAGIC_BASE_PAGE_SIZE,
	buildMagicBaseRowsRequest,
	type MagicBaseFilterCondition,
} from "./utils"

interface UseMagicBaseRowsParams {
	active: boolean
	projectId?: string
	tableId: string | null
	table?: MagicBaseTable
	sort: MagicBaseSortRule | null
	filters: MagicBaseFilterCondition[]
}

function getRowRecordId(row: MagicBaseRow): string {
	return String(row.id ?? row.record_id ?? "")
}

export default function useMagicBaseRows({
	active,
	projectId,
	tableId,
	table,
	sort,
	filters,
}: UseMagicBaseRowsParams) {
	const loadRequestedRef = useRef(false)
	const {
		data: pages,
		error,
		isLoading,
		isValidating,
		size,
		setSize,
		mutate,
	} = useSWRInfinite<MagicBaseQueryRowsResponse>(
		(pageIndex, previousPageData) => {
			if (!active || !projectId || !tableId || !table) return null
			if (previousPageData && previousPageData.list.length === 0) return null
			if (previousPageData && pageIndex * MAGIC_BASE_PAGE_SIZE >= previousPageData.total) {
				return null
			}

			return {
				scope: "magicbase-rows",
				projectId,
				tableId,
				request: buildMagicBaseRowsRequest({
					table,
					sort,
					page: pageIndex + 1,
					filters,
				}),
			}
		},
		({ projectId: currentProjectId, tableId: currentTableId, request }) =>
			MagicBaseApi.queryRows(currentProjectId, currentTableId, request),
	)

	const rows = useMemo(() => {
		const seenRowIds = new Set<string>()
		return (pages || []).flatMap((currentPage) =>
			currentPage.list.filter((row) => {
				const rowId = getRowRecordId(row)
				if (!rowId) return true
				if (seenRowIds.has(rowId)) return false
				seenRowIds.add(rowId)
				return true
			}),
		)
	}, [pages])
	const total = pages?.[0]?.total || 0
	const hasMore = rows.length < total
	const loadingMore = isValidating && Boolean(pages) && pages?.[size - 1] === undefined

	useEffect(() => {
		loadRequestedRef.current = false
	}, [filters, sort, tableId])

	useEffect(() => {
		if (!loadingMore) loadRequestedRef.current = false
	}, [loadingMore, rows.length])

	const loadMore = useCallback(() => {
		if (!hasMore || loadingMore || loadRequestedRef.current) return
		loadRequestedRef.current = true
		setSize((pageCount) => pageCount + 1)
	}, [hasMore, loadingMore, setSize])

	return {
		rows,
		total,
		hasMore,
		loadingMore,
		error,
		isLoading,
		loadMore,
		refresh: mutate,
	}
}
