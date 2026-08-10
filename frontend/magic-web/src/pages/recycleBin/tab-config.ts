import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { baseHistory } from "@/routes/history"

type RecycleBinTabVariant = "pc" | "mobile"
const RECYCLE_BIN_TAB_QUERY_KEY = "recycleTab"

const RECYCLE_BIN_TABS_CONFIG = [
	{ id: "all" },
	{ id: "workspaces" },
	{ id: "projects" },
	{ id: "topics" },
	{ id: "files" },
	{ id: "microApps" },
] as const

type RecycleBinTabId = (typeof RECYCLE_BIN_TABS_CONFIG)[number]["id"]

const RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID: Record<number, RecycleBinTabId> = {
	1: "workspaces",
	2: "projects",
	3: "topics",
	4: "files",
	5: "microApps",
}

interface RecycleBinTab {
	id: RecycleBinTabId
	count: number
}

function useRecycleBinTabLabel(variant: RecycleBinTabVariant) {
	const { t } = useTranslation("super")

	return useCallback(
		(tabId: RecycleBinTabId, count: number) => {
			if (variant === "mobile") {
				if (tabId === "all") return t("mobile.recycleBin.tabs.all", { count })
				if (tabId === "workspaces") return t("mobile.recycleBin.tabs.workspaces", { count })
				if (tabId === "projects") return t("mobile.recycleBin.tabs.projects", { count })
				if (tabId === "topics") return t("mobile.recycleBin.tabs.topics", { count })
				if (tabId === "files") return t("mobile.recycleBin.tabs.files", { count })
				return t("mobile.recycleBin.tabs.microApps", { count })
			}

			if (tabId === "all") return t("recycleBin.tabs.all", { count })
			if (tabId === "workspaces") return t("recycleBin.tabs.workspaces", { count })
			if (tabId === "projects") return t("recycleBin.tabs.projects", { count })
			if (tabId === "topics") return t("recycleBin.tabs.topics", { count })
			if (tabId === "files") return t("recycleBin.tabs.files", { count })
			return t("recycleBin.tabs.microApps", { count })
		},
		[t, variant],
	)
}

function isRecycleBinTabId(tabId: string): tabId is RecycleBinTabId {
	return RECYCLE_BIN_TABS_CONFIG.some((tab) => tab.id === tabId)
}

function getRecycleBinTabIdFromSearchParams(searchParams: URLSearchParams): RecycleBinTabId | null {
	const tabFromQuery = searchParams.get(RECYCLE_BIN_TAB_QUERY_KEY)
	if (tabFromQuery && isRecycleBinTabId(tabFromQuery)) return tabFromQuery
	return null
}

function getRecycleBinTabIdFromQuery(): RecycleBinTabId | null {
	if (typeof window === "undefined") return null

	const params = new URLSearchParams(window.location.search)
	return getRecycleBinTabIdFromSearchParams(params)
}

function setRecycleBinTabQuery(tabId: RecycleBinTabId) {
	if (typeof window === "undefined") return
	const url = new URL(window.location.href)
	const currentTab = url.searchParams.get(RECYCLE_BIN_TAB_QUERY_KEY)
	if (currentTab === tabId) return

	url.searchParams.set(RECYCLE_BIN_TAB_QUERY_KEY, tabId)

	baseHistory.replace({
		pathname: url.pathname,
		search: url.search,
		hash: url.hash,
	})
}

function createRecycleBinTabCounts(): Record<RecycleBinTabId, number> {
	return {
		all: 0,
		workspaces: 0,
		projects: 0,
		topics: 0,
		files: 0,
		microApps: 0,
	}
}

function getRecycleBinTabs(props: { counts: Record<string, number> }): RecycleBinTab[] {
	const { counts } = props
	return RECYCLE_BIN_TABS_CONFIG.map((tab) => ({
		id: tab.id,
		count: counts[tab.id] ?? 0,
	}))
}

export {
	RECYCLE_BIN_TABS_CONFIG,
	RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID,
	createRecycleBinTabCounts,
	getRecycleBinTabs,
	getRecycleBinTabIdFromQuery,
	getRecycleBinTabIdFromSearchParams,
	isRecycleBinTabId,
	setRecycleBinTabQuery,
	useRecycleBinTabLabel,
}
export type { RecycleBinTab, RecycleBinTabId, RecycleBinTabVariant }
