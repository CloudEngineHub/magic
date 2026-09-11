import { useCallback, useState } from "react"
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

export function usePublishedMicroAppTab(): UsePublishedMicroAppTabReturn {
	const [publishedMicroAppTabs, setPublishedMicroAppTabs] = useState<PublishedMicroAppTabItem[]>(
		[],
	)

	const isPublishedMicroAppTab = useCallback((tabId: string) => {
		return tabId.startsWith(PUBLISHED_MICRO_APP_TAB_ID_PREFIX)
	}, [])

	const openPublishedMicroAppTab = useCallback((data: PublishedMicroAppTabData) => {
		const appId = data.appId.trim()
		if (!appId) return

		const tabId = buildPublishedMicroAppTabId(appId)
		const title = data.appName?.trim() || appId

		setPublishedMicroAppTabs((prev) => {
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
	}, [])

	const closePublishedMicroAppTab = useCallback((tabId: string) => {
		setPublishedMicroAppTabs((prev) => prev.filter((tab) => tab.id !== tabId))
	}, [])

	const deactivateAllPublishedMicroAppTabs = useCallback(() => {
		setPublishedMicroAppTabs((prev) => prev.map((tab) => ({ ...tab, active: false })))
	}, [])

	return {
		publishedMicroAppTabs,
		openPublishedMicroAppTab,
		closePublishedMicroAppTab,
		isPublishedMicroAppTab,
		deactivateAllPublishedMicroAppTabs,
	}
}
