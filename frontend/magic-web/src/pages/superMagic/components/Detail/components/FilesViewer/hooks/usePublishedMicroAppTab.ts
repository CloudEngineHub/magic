import { useCallback, useEffect, useState } from "react"
import { PUBLISHED_MICRO_APP_TAB_ID_PREFIX } from "../utils/tabConstants"

export interface PublishedMicroAppTabData {
	appId: string
	appName?: string
}

export interface PublishedMicroAppTabItem {
	id: string
	type: "micro_app"
	title: string
	isPublishedMicroAppTab: true
	active: boolean
	closeable: boolean
	fileData: Record<string, never>
	data: PublishedMicroAppTabData
	create_at: number
}

// Published micro-app tabs are not regular file tabs, so they are kept outside
// the FilesViewer instance. This preserves the active preview when navigating
// from a project page to a topic page while keeping projects isolated.
const publishedMicroAppTabsByProject = new Map<string, PublishedMicroAppTabItem[]>()

export function buildPublishedMicroAppTabId(appId: string) {
	return `${PUBLISHED_MICRO_APP_TAB_ID_PREFIX}${appId}`
}

interface UsePublishedMicroAppTabReturn {
	publishedMicroAppTabs: PublishedMicroAppTabItem[]
	openPublishedMicroAppTab: (data: PublishedMicroAppTabData) => void
	closePublishedMicroAppTab: (tabId: string) => void
	isPublishedMicroAppTab: (tabId: string) => boolean
	deactivateAllPublishedMicroAppTabs: () => void
}

export function usePublishedMicroAppTab(projectId?: string): UsePublishedMicroAppTabReturn {
	const projectKey = projectId || "__default__"
	const [publishedMicroAppTabs, setPublishedMicroAppTabs] = useState<PublishedMicroAppTabItem[]>(
		() => publishedMicroAppTabsByProject.get(projectKey) || [],
	)

	useEffect(() => {
		setPublishedMicroAppTabs(publishedMicroAppTabsByProject.get(projectKey) || [])
	}, [projectKey])

	const updateTabs = useCallback(
		(
			next:
				| PublishedMicroAppTabItem[]
				| ((previous: PublishedMicroAppTabItem[]) => PublishedMicroAppTabItem[]),
		) => {
			setPublishedMicroAppTabs((previous) => {
				const updated = typeof next === "function" ? next(previous) : next
				if (updated.length > 0) {
					publishedMicroAppTabsByProject.set(projectKey, updated)
				} else {
					publishedMicroAppTabsByProject.delete(projectKey)
				}
				return updated
			})
		},
		[projectKey],
	)

	const isPublishedMicroAppTab = useCallback((tabId: string) => {
		return tabId.startsWith(PUBLISHED_MICRO_APP_TAB_ID_PREFIX)
	}, [])

	const openPublishedMicroAppTab = useCallback(
		(data: PublishedMicroAppTabData) => {
			const appId = data.appId.trim()
			if (!appId) return

			const tabId = buildPublishedMicroAppTabId(appId)
			const title = data.appName?.trim() || appId

			updateTabs((prev) => {
				const existing = prev.find((tab) => tab.id === tabId)
				if (existing) {
					return prev.map((tab) => ({ ...tab, active: tab.id === tabId }))
				}

				const deactivated = prev.map((tab) => ({ ...tab, active: false }))
				const newTab: PublishedMicroAppTabItem = {
					id: tabId,
					type: "micro_app",
					title,
					isPublishedMicroAppTab: true,
					active: true,
					closeable: true,
					fileData: {},
					data: { appId, appName: title },
					create_at: Date.now(),
				}
				return [...deactivated, newTab]
			})
		},
		[updateTabs],
	)

	const closePublishedMicroAppTab = useCallback(
		(tabId: string) => {
			updateTabs((prev) => prev.filter((tab) => tab.id !== tabId))
		},
		[updateTabs],
	)

	const deactivateAllPublishedMicroAppTabs = useCallback(() => {
		updateTabs((prev) => prev.map((tab) => ({ ...tab, active: false })))
	}, [updateTabs])

	return {
		publishedMicroAppTabs,
		openPublishedMicroAppTab,
		closePublishedMicroAppTab,
		isPublishedMicroAppTab,
		deactivateAllPublishedMicroAppTabs,
	}
}
