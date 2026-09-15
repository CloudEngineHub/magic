import { useEffect, useRef, useState, type Dispatch, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import {
	UserFileTabsRepository,
	type CachedUserFileTab,
} from "@/services/superMagic/repositories/UserFileTabsRepository"
import {
	getFileReferenceIdentityKey,
	resolveFileReference,
} from "@/pages/superMagic/services/userFileReferenceResolver"
import {
	createUserFilePreview,
	USER_FILE_PREVIEW_POLICY,
} from "@/pages/superMagic/components/UserSpace/services/userSpaceFileService"
import type { FileItem, TabAction, TabItem } from "../types"
import { TabActionType } from "../types"
import { convertFileToTabItem, mergeUserFileTabs } from "../utils/tabUtils"

interface Options {
	enabled: boolean
	identityKey: string | null
	tabsRef: RefObject<TabItem[]>
	dispatchTabs: Dispatch<TabAction>
	onRestoreActive: () => void
}

/** 只适配持久化；标签、预览组件、关闭保护仍由 FilesViewer 和原 reducer 持有。 */
export function useUserFileTabsPersistence({
	enabled,
	identityKey,
	tabsRef,
	dispatchTabs,
	onRestoreActive,
}: Options) {
	const repository = useRef(new UserFileTabsRepository()).current
	const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null)
	const positions = useRef(new Map<string, CachedUserFileTab>())
	const interacted = useRef(false)
	const closedIds = useRef(new Set<string>())
	const closeAll = useRef(false)
	const keepOnly = useRef<string>()
	const isUserTab = useMemoizedFn(
		(tab: TabItem) =>
			tab.userIdentityKey === identityKey &&
			tab.fileData.space_type === "user" &&
			tab.type !== "file_manager",
	)
	const restoredActive = useMemoizedFn(onRestoreActive)

	// 读取期间的新点击优先；明确关闭的标签不能被迟到的恢复结果重新打开。
	const recordAction = useMemoizedFn((action: TabAction) => {
		if (
			[
				TabActionType.SYNC_TABS_DATA,
				TabActionType.SYNC_USER_FILE_REFERENCES,
				TabActionType.UPDATE_TAB,
			].includes(action.type)
		)
			return
		interacted.current = true
		if (action.type === TabActionType.REMOVE_TAB && action.payload?.tabId)
			closedIds.current.add(action.payload.tabId)
		if (action.type === TabActionType.ADD_TAB && action.payload?.tab)
			closedIds.current.delete(action.payload.tab.id)
		if (action.type === TabActionType.CLEAR_TABS) {
			closeAll.current = true
			keepOnly.current = undefined
		}
		if (action.type === TabActionType.CLOSE_OTHER_TABS) {
			closeAll.current = true
			keepOnly.current = action.payload?.tabId
		}
		if (action.type === TabActionType.CLOSE_TABS_TO_RIGHT) {
			const tabs = tabsRef.current || []
			const index = tabs.findIndex((tab) => tab.id === action.payload?.tabId)
			if (index >= 0) tabs.slice(index + 1).forEach((tab) => closedIds.current.add(tab.id))
		}
	})

	const mergeWithUserTabs = useMemoizedFn(
		(otherTabs: TabItem[], userTabs = (tabsRef.current || []).filter(isUserTab)) => {
			return mergeUserFileTabs(
				otherTabs,
				userTabs,
				interacted.current
					? undefined
					: Object.fromEntries(
							[...positions.current].map(([id, tab]) => [id, tab.order]),
						),
			)
		},
	)

	useEffect(() => {
		setLoadedIdentity(null)
		positions.current.clear()
		interacted.current = false
		closedIds.current.clear()
		closeAll.current = false
		keepOnly.current = undefined
		if (!enabled || !identityKey) return
		const controller = new AbortController()
		const isCurrent = () =>
			!controller.signal.aborted && identityKey === getFileReferenceIdentityKey()
		void (async () => {
			try {
				const record = await repository.get(identityKey)
				if (!isCurrent()) return
				const cachedTabs = record?.tabs || []
				positions.current = new Map(cachedTabs.map((tab) => [tab.fileId, tab]))
				const restoredTabs = await Promise.all(
					cachedTabs.map(async (cached) => {
						let file: FileItem = {
							file_id: cached.fileId,
							file_name: cached.title,
							file_extension: cached.title.includes(".")
								? cached.title.split(".").pop()
								: "",
							space_type: "user",
							display_config: { previewPolicy: { ...USER_FILE_PREVIEW_POLICY } },
						}
						let unavailable = false
						try {
							const result = await resolveFileReference(
								{ file_id: cached.fileId },
								controller.signal,
							)
							if (
								result.status === "resolved" &&
								result.reference.space_type === "user" &&
								!result.reference.is_directory
							)
								file = createUserFilePreview(result.reference)
							else unavailable = true
						} catch {
							// 网络失败不删除记录；原预览器继续按 ID 加载，原刷新动作可以重新鉴权。
						}
						const tab = convertFileToTabItem(file, undefined, {
							active: false,
							active_at: cached.activeAt,
						})
						return tab
							? { ...tab, userIdentityKey: identityKey, isDeleted: unavailable }
							: null
					}),
				)
				if (!isCurrent()) return
				const currentTabs = (tabsRef.current || []).filter(
					(tab) =>
						tab.userIdentityKey === undefined || tab.userIdentityKey === identityKey,
				)
				const currentIds = new Set(currentTabs.map((tab) => tab.id))
				const recovered = restoredTabs.filter(
					(tab): tab is TabItem & { userIdentityKey: string; isDeleted: boolean } =>
						Boolean(
							tab &&
							!currentIds.has(tab.id) &&
							(!closeAll.current || tab.id === keepOnly.current) &&
							!closedIds.current.has(tab.id),
						),
				)
				const userTabs = [...currentTabs.filter(isUserTab), ...recovered]
				const activateId = !interacted.current ? record?.activeTabId : undefined
				const hasRestoredActive = userTabs.some((tab) => tab.id === activateId)
				if (hasRestoredActive) restoredActive()
				dispatchTabs({
					type: TabActionType.RESTORE_USER_FILE_TABS,
					payload: {
						tabs: recovered,
						userIdentityKey: identityKey,
						userTabPositions: interacted.current
							? undefined
							: Object.fromEntries(
									[...positions.current].map(([id, tab]) => [id, tab.order]),
								),
						restoredActiveTabId: hasRestoredActive ? activateId : undefined,
					},
				})
				setLoadedIdentity(identityKey)
			} catch (error) {
				// 读不到本地缓存时禁止用初始空列表覆盖它。
				if (isCurrent()) console.error("Failed to restore user file tabs", error)
			}
		})()
		return () => controller.abort()
	}, [
		enabled,
		identityKey,
		repository,
		tabsRef,
		dispatchTabs,
		isUserTab,
		mergeWithUserTabs,
		restoredActive,
	])

	const save = useMemoizedFn(async (preservePositions: boolean) => {
		if (
			!enabled ||
			!identityKey ||
			loadedIdentity !== identityKey ||
			identityKey !== getFileReferenceIdentityKey()
		)
			return
		const allTabs = tabsRef.current || []
		const tabs = allTabs.flatMap((tab, order) =>
			isUserTab(tab) && tab.fileData.display_config?.previewPolicy?.persistTab !== false
				? [
						{
							fileId: tab.fileData.file_id,
							title: tab.fileData.file_name,
							order: preservePositions
								? (positions.current.get(tab.id)?.order ?? order)
								: order,
							activeAt: tab.active_at || tab.create_at || 0,
						},
					]
				: [],
		)
		positions.current = new Map(tabs.map((tab) => [tab.fileId, tab]))
		await repository.put({
			id: identityKey,
			tabs,
			activeTabId: allTabs.find((tab) => tab.active && isUserTab(tab))?.id,
		})
	})

	return {
		loaded: Boolean(identityKey && loadedIdentity === identityKey),
		save,
		mergeWithUserTabs,
		recordAction,
	}
}
