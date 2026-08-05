import { useCallback, useEffect, useRef, useState } from "react"
import { SuperMagicApi } from "@/apis"
import type {
	MicroAppListItem as ApiMicroAppListItem,
	MicroAppListResponse as ApiMicroAppListResponse,
	MicroAppListScope,
} from "@/apis/modules/superMagic"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"

const MICRO_APP_PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 250

interface MicroAppListItem extends ApiMicroAppListItem {
	can_delete: boolean
}

interface MicroAppListResponse extends Omit<ApiMicroAppListResponse, "list"> {
	list: MicroAppListItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object")
}

function normalizeMicroAppItem(item: unknown): MicroAppListItem | null {
	if (!isRecord(item) || !item.app_id) return null

	return {
		app_id: String(item.app_id),
		app_name: String(item.app_name ?? ""),
		app_description: String(item.app_description ?? ""),
		creator_id: String(item.creator_id ?? ""),
		cover_url: String(item.cover_url ?? ""),
		publish_status: String(item.publish_status ?? "unpublished"),
		updated_at: item.updated_at == null ? null : String(item.updated_at),
		can_delete: item.can_delete !== false,
	}
}

export function normalizeMicroAppListResponse(response: unknown): MicroAppListResponse {
	const payload = isRecord(response) && isRecord(response.data) ? response.data : response
	if (!isRecord(payload)) {
		return { list: [], total: 0, page: 1, page_size: MICRO_APP_PAGE_SIZE }
	}

	const list = Array.isArray(payload.list)
		? payload.list
				.map(normalizeMicroAppItem)
				.filter((item): item is MicroAppListItem => Boolean(item))
		: []

	return {
		list,
		total: Number(payload.total ?? list.length),
		page: Number(payload.page ?? 1),
		page_size: Number(payload.page_size ?? MICRO_APP_PAGE_SIZE),
	}
}

export function useMicroAppWorkspace(refreshVersion = 0) {
	const [workspace, setWorkspace] = useState<Workspace | null>(null)
	const workspaceRef = useRef<Workspace | null>(null)

	useEffect(() => {
		if (workspaceRef.current) return

		let active = true

		SuperMagicApi.getMicroAppWorkspace()
			.then((nextWorkspace) => {
				if (!active) return
				workspaceRef.current = nextWorkspace
				setWorkspace(nextWorkspace)
			})
			.catch((workspaceError) => {
				if (active) console.error("Failed to load micro app workspace:", workspaceError)
			})

		return () => {
			active = false
		}
	}, [refreshVersion])

	return workspace
}

export function useMicroAppsPage() {
	const [apps, setApps] = useState<MicroAppListItem[]>([])
	const [scope, setScope] = useState<MicroAppListScope>("all")
	const [keyword, setKeyword] = useState("")
	const [page, setPage] = useState(1)
	const [total, setTotal] = useState(0)
	const [loading, setLoading] = useState(true)
	const [loadingMore, setLoadingMore] = useState(false)
	const [error, setError] = useState<unknown>(null)
	const [refreshVersion, setRefreshVersion] = useState(0)
	const requestIdRef = useRef(0)
	const workspace = useMicroAppWorkspace(refreshVersion)
	useEffect(() => {
		const requestId = ++requestIdRef.current
		let active = true
		const timer = window.setTimeout(async () => {
			setLoading(true)
			setError(null)
			setApps([])
			setPage(1)

			try {
				const response = await SuperMagicApi.getMicroApps({
					page: 1,
					page_size: MICRO_APP_PAGE_SIZE,
					keyword: keyword.trim(),
					scope,
				})
				if (!active || requestId !== requestIdRef.current) return

				const normalized = normalizeMicroAppListResponse(response)
				setApps(normalized.list)
				setTotal(normalized.total)
				setPage(normalized.page)
			} catch (nextError) {
				if (!active || requestId !== requestIdRef.current) return
				setError(nextError)
				setApps([])
				setTotal(0)
			} finally {
				if (active && requestId === requestIdRef.current) setLoading(false)
			}
		}, SEARCH_DEBOUNCE_MS)

		return () => {
			active = false
			window.clearTimeout(timer)
		}
	}, [keyword, refreshVersion, scope])

	const loadMore = useCallback(async () => {
		if (loading || loadingMore || apps.length >= total) return

		const requestId = ++requestIdRef.current
		setLoadingMore(true)
		try {
			const response = await SuperMagicApi.getMicroApps({
				page: page + 1,
				page_size: MICRO_APP_PAGE_SIZE,
				keyword: keyword.trim(),
				scope,
			})
			if (requestId !== requestIdRef.current) return

			const normalized = normalizeMicroAppListResponse(response)
			setApps((current) => [...current, ...normalized.list])
			setTotal(normalized.total)
			setPage(normalized.page)
		} catch (nextError) {
			if (requestId === requestIdRef.current) setError(nextError)
		} finally {
			if (requestId === requestIdRef.current) setLoadingMore(false)
		}
	}, [apps.length, keyword, loading, loadingMore, page, scope, total])

	const renameApp = useCallback(async (appId: string, appName: string) => {
		const metadata = await SuperMagicApi.updateMicroApp(appId, { app_name: appName })
		setApps((current) =>
			current.map((app) =>
				app.app_id === appId
					? {
							...app,
							app_name: metadata.app_name || appName,
							updated_at: metadata.updated_at ?? app.updated_at,
						}
					: app,
			),
		)
		return metadata
	}, [])

	const deleteApp = useCallback(async (appId: string) => {
		const result = await SuperMagicApi.deleteMicroApp(appId)
		setApps((current) => current.filter((app) => app.app_id !== appId))
		setTotal((current) => Math.max(0, current - 1))
		// 删除会改变分页边界，重新加载第一页，避免后续加载更多时跳过一条记录。
		setRefreshVersion((value) => value + 1)
		return result
	}, [])

	const refresh = useCallback(() => {
		setRefreshVersion((value) => value + 1)
	}, [])

	return {
		workspace,
		apps,
		scope,
		setScope,
		keyword,
		setKeyword,
		loading,
		loadingMore,
		hasMore: apps.length < total,
		error,
		refresh,
		loadMore,
		renameApp,
		deleteApp,
	}
}
