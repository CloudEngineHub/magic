import { useFileAccess } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { useFileApi } from "@/pages/superMagic/fileAccess/fileApi"
import {
	getFileAccessContentKey,
	isShareFileAccess,
} from "@/pages/superMagic/fileAccess/fileAccessContext"
import { downloadFileContent } from "@/pages/superMagic/utils/api"
import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react"
import { useDebounceEffect, useMemoizedFn } from "ahooks"
import { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"
import magicToast from "@/components/base/MagicToaster/utils"
import { useTranslation } from "react-i18next"
import useShareRoute from "./useShareRoute"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { SuperMagicApi } from "@/apis"
import { isNil } from "lodash-es"
import { superMagicStore } from "@/pages/superMagic/stores"
import { useLatestAbortableRequest } from "./useLatestAbortableRequest"

interface FileUrlCache {
	url: string
	updatedAt: string
	version?: number
}

interface LoadedFileContent extends FileUrlCache {
	resourceKey: string
}

type FileContent = Awaited<ReturnType<typeof downloadFileContent>>

export const useFileData = ({
	file_id,
	responseType = "text",
	isEditing = false,
	updatedAt,
	activeFileId,
	isFromNode = false,
	content,
	disabledUrlCache = false,
	isSharePreview = false,
	enabled = true,
}: {
	file_id: string
	responseType?: "text" | "arrayBuffer" | "blob"
	isEditing?: boolean
	updatedAt?: string
	activeFileId?: string | null
	isFromNode?: boolean
	content?: string
	disabledUrlCache?: boolean
	/** 分享预览不拉项目文件版本，走分享下载 */
	isSharePreview?: boolean
	/** 外部编辑会话供数时关闭读取、历史版本与事件订阅。 */
	enabled?: boolean
}) => {
	const { t } = useTranslation("super")
	const { isShareRoute } = useShareRoute()
	const fileAccess = useFileAccess()
	// Bind the ambient share/session identity once at this boundary; the leaf
	// download-url calls below must never run without it on share previews.
	const fileApi = useFileApi()
	// Load strategy follows access kind, not URL. Published runtime uses
	// session access on /micro-app even though the route is a share page.
	const isShareFilePreview = isShareFileAccess(fileAccess)
	const waitingForShareAccess = (isShareRoute || isSharePreview) && !fileAccess
	const shareAccessKey =
		fileAccess?.kind === "share"
			? `${fileAccess.token}:${fileAccess.projectId}:${fileAccess.topicId ?? ""}`
			: ""

	/** 文件 URL 缓存 - 存储文件 ID 对应的 URL 和更新时间 */
	const fileUrlCacheRef = useRef<Record<string, FileUrlCache>>({})

	/** 文件地址 */
	const [fileUrl, setFileUrl] = useState<string>("")
	/** 文件数据 */
	const [storedFileData, setStoredFileData] = useState<any>(null)
	/** 文件版本 */
	const [fileVersion, setFileVersion] = useState<number>()
	/** 版本列表 */
	const [fileVersionsList, setFileVersionsList] = useState<FileHistoryVersion[]>([])
	/** 是否正在加载 */
	const [loading, setLoading] = useState(enabled && isNil(content))
	/** 是否是删除的文件 */
	const [isDeleted, setIsDeleted] = useState(false)
	// 地址缓存只证明拿到过 URL；只有正文成功写入后，才记录其文件、类型与版本。
	// 空字符串是合法正文；null / undefined 表示未加载，不能用 truthy 判断缓存命中。
	const resourceKey = JSON.stringify([getFileAccessContentKey(fileAccess), file_id, responseType])
	const loadedContentRef = useRef<LoadedFileContent | null>(null)
	const storedResourceRef = useRef(resourceKey)
	const fileData = storedResourceRef.current === resourceKey ? storedFileData : null
	const setFileData = useMemoizedFn((value: SetStateAction<FileContent | null | undefined>) => {
		loadedContentRef.current = null
		storedResourceRef.current = resourceKey
		setStoredFileData(value)
	})
	const { startRequest, cancelCurrent } = useLatestAbortableRequest()
	const selectionRevisionRef = useRef(0)
	const selectedVersionRef = useRef<number>()
	const historyRequestRef = useRef(0)
	const [reloadRevision, setReloadRevision] = useState(0)
	const requestKey = JSON.stringify([
		resourceKey,
		fileApi.identityKey,
		updatedAt,
		activeFileId,
		enabled,
		waitingForShareAccess,
		disabledUrlCache,
		reloadRevision,
	])
	const currentRequestKeyRef = useRef(requestKey)
	currentRequestKeyRef.current = requestKey
	const isEditingRef = useRef(isEditing)
	isEditingRef.current = isEditing

	/** 智能更新文件 URL - 地址、更新时间或版本变化时更新 */
	const updateFileUrlIfNeeded = useMemoizedFn(
		(newUrl: string, fileId: string, newUpdatedAt?: string, newVersion?: number) => {
			// 如果禁用缓存，直接更新 URL 并返回 true
			if (disabledUrlCache) {
				setFileUrl(newUrl)
				return true
			}
			const cachedData = fileUrlCacheRef.current[fileId]
			const currentUpdatedAt = newUpdatedAt || updatedAt || ""
			// 检查是否需要更新：没有缓存数据、地址、更新时间或版本变化
			const shouldUpdate =
				!cachedData ||
				cachedData.url !== newUrl ||
				cachedData.updatedAt !== currentUpdatedAt ||
				cachedData.version !== newVersion

			if (shouldUpdate) {
				fileUrlCacheRef.current[fileId] = {
					url: newUrl,
					updatedAt: currentUpdatedAt,
					version: newVersion,
				}
				setFileUrl(newUrl)
				return true
			} else {
				return false
			}
		},
	)

	// 两个入口共用同一正文生命周期，避免切到后台后清空内容却仍命中 URL 缓存。
	const loadFile = useMemoizedFn(
		(version?: number, notifyVersionChange = false, versions?: FileHistoryVersion[]) => {
			if (!enabled || !file_id || waitingForShareAccess) return
			const request = startRequest()
			const isCurrent = () =>
				request.isCurrent() && currentRequestKeyRef.current === requestKey
			const loaded = loadedContentRef.current
			// 同一内容只更新凭证或切换标签时，保留已挂载的预览；新文件／版本仍显示加载。
			if (
				loaded?.resourceKey !== resourceKey ||
				loaded.version !== version ||
				isNil(fileData)
			)
				setLoading(true)

			void (async () => {
				try {
					const items = await fileApi.getTemporaryDownloadUrl({
						file_ids: [file_id],
						file_versions: version === undefined ? undefined : { [file_id]: version },
					})
					if (!isCurrent()) return
					const url = items[0]?.url
					if (!url) {
						setIsDeleted(true)
						if (notifyVersionChange) magicToast.error(t("common.fileUrlFetchFailed"))
						return
					}
					setIsDeleted(false)
					updateFileUrlIfNeeded(url, file_id, updatedAt, version)
					setFileVersion(version)
					if (versions) setFileVersionsList(versions)
					if (notifyVersionChange)
						pubsub.publish(PubSubEvents.Change_Preview_File_Version, file_id, version)

					const cached = loadedContentRef.current
					const contentReady =
						!isNil(fileData) &&
						cached?.resourceKey === resourceKey &&
						cached.url === url &&
						cached.updatedAt === (updatedAt || "") &&
						cached.version === version
					if (!disabledUrlCache && contentReady) return
					const data = await downloadFileContent(url, {
						responseType,
						signal: request.signal,
					})
					if (!isCurrent()) return
					storedResourceRef.current = resourceKey
					loadedContentRef.current = {
						resourceKey,
						url,
						updatedAt: updatedAt || "",
						version,
					}
					setStoredFileData(data)
				} catch {
					// 下载层沿用原有错误上报。失败不改变成功记录，后续相同 URL 仍可补读。
				} finally {
					if (isCurrent()) setLoading(false)
					request.release()
				}
			})()
			// effect 只取消自己发起的读取，不能中断后来由版本选择发起的请求。
			return () => {
				if (request.isCurrent()) cancelCurrent()
			}
		},
	)

	/** 更改文件版本 */
	const changeFileVersion = useMemoizedFn(
		(file_version: number | undefined, fileVersionsList?: FileHistoryVersion[]) => {
			if (!enabled || !file_id || waitingForShareAccess) return
			selectionRevisionRef.current += 1
			selectedVersionRef.current = file_version
			loadFile(file_version, true, fileVersionsList)
		},
	)

	/**
	 * 获取文件版本列表
	 * @param fileId 文件ID
	 * @param page_size 每页数量（用于分页）
	 * @param isLoadMore 是否加载更多（用于分页）
	 * @param isSelectNewest 是否自动更新当前文件为最新版本的文件数据
	 * @returns 文件版本列表
	 */
	const fetchFileVersions = useMemoizedFn(async (fileId: string, isSelectNewest = false) => {
		if (!enabled) return []
		const historyRequest = ++historyRequestRef.current
		const selectionRevision = selectionRevisionRef.current
		const isCurrent = () =>
			historyRequest === historyRequestRef.current &&
			requestKey === currentRequestKeyRef.current &&
			fileId === file_id
		try {
			const res = await SuperMagicApi.getFileHistoryVersions({
				file_id: fileId,
				page_size: 10,
			})
			if (!isCurrent()) return []
			if (res && res.list) {
				// 列表晚到只能更新列表；不能把用户刚选的历史版本切回最新版本。
				if (
					isSelectNewest &&
					selectionRevision === selectionRevisionRef.current &&
					selectedVersionRef.current === undefined &&
					!isEditingRef.current
				) {
					changeFileVersion(undefined, res.list)
				} else {
					setFileVersionsList(res.list)
				}
				return res.list
			} else {
				setFileVersionsList([])
				return []
			}
		} catch (error) {
			if (!isCurrent()) return []
			console.error("🚀 ~ CommonFooter ~ error:", error)
			setFileVersionsList([])
			return []
		}
	})

	/** 还原文件版本 */
	const handleVersionRollback = useMemoizedFn(async (file_version?: number) => {
		try {
			if (!enabled || !file_id || !file_version) return

			const loading = magicToast.loading(t("common.rollbacking"))

			const res = await SuperMagicApi.rollbackFileVersion({
				file_id,
				version: file_version,
			})
			if (res) {
				const list = await fetchFileVersions(file_id)
				if (list && list.length > 0) {
					selectedVersionRef.current = list[0].version
					setFileVersion?.(list[0].version)
					magicToast.destroy(loading)
					magicToast.success(t("common.rollbackSuccess"))
				}
			}
		} catch (error) {
			console.log("🚀 ~ error:", error)
		}
	})

	/** 是否是最新版本 */
	const isNewestVersion = useMemo(() => {
		return !fileVersion || fileVersion === fileVersionsList[0]?.version
	}, [fileVersion, fileVersionsList])

	const getFileVersion = useMemoizedFn(async (file_id: string, isSelectNewest?: boolean) => {
		// 获取文件版本列表
		fetchFileVersions(file_id, isSelectNewest)
	})

	useEffect(() => {
		return () => {
			cancelCurrent()
			historyRequestRef.current += 1
		}
	}, [requestKey, cancelCurrent])

	useEffect(() => {
		fileUrlCacheRef.current = {}
		setFileUrl("")
		setFileData(null)
		selectedVersionRef.current = undefined
		setFileVersion(undefined)
		setFileVersionsList([])
	}, [resourceKey, setFileData])

	useDebounceEffect(
		() => {
			if (!enabled || waitingForShareAccess) return
			// 如果正在编辑但文件数据还没有加载，需要先加载文件
			if (
				isEditing &&
				!fileData &&
				file_id &&
				activeFileId === file_id &&
				!isShareFilePreview
			) {
				getFileVersion(file_id)
				return
			}
			// 非编辑模式下的正常逻辑
			if (
				!file_id ||
				isEditing ||
				!activeFileId ||
				activeFileId !== file_id ||
				isShareFilePreview
			)
				return
			// 是否正在查看历史版本
			const isViewingHistoryVersion = fileVersion !== undefined
			// 如果用户正在查看历史版本，只更新版本列表，不自动切换到最新版本
			getFileVersion(file_id, !isViewingHistoryVersion)
		},
		[
			enabled,
			activeFileId,
			updatedAt,
			file_id,
			isEditing,
			isShareFilePreview,
			fileData,
			fileApi,
			responseType,
			reloadRevision,
			disabledUrlCache,
			waitingForShareAccess,
		],
		{
			wait: 100,
		},
	)

	/** 针对 分享/工具预览/内容审查 等场景，单独获取文件的最新下载地址 */
	useEffect(() => {
		if (!enabled || !file_id) return
		if (waitingForShareAccess) {
			setLoading(true)
			return
		}
		if (isShareFilePreview || !activeFileId || activeFileId !== file_id) {
			return loadFile(selectedVersionRef.current)
		}
	}, [
		activeFileId,
		enabled,
		fileApi,
		file_id,
		isShareFilePreview,
		shareAccessKey,
		updatedAt,
		responseType,
		disabledUrlCache,
		loadFile,
		reloadRevision,
		waitingForShareAccess,
	])

	useEffect(() => {
		if (!enabled) return
		pubsub.subscribe(PubSubEvents.Change_Preview_File, () => {
			cancelCurrent()
			historyRequestRef.current += 1
			selectionRevisionRef.current += 1
			selectedVersionRef.current = undefined
			setFileUrl("")
			setFileData(undefined)
			setFileVersion(undefined)
			setFileVersionsList([])
			// 清空 URL 缓存
			fileUrlCacheRef.current = {}
			setReloadRevision((revision) => revision + 1)
		})

		return () => {
			pubsub.unsubscribe(PubSubEvents.Change_Preview_File)
		}
	}, [enabled, cancelCurrent, setFileData])

	// 由于后端的文件版本生成机制，是在每一轮 Topic 执行结束时生成，
	// 因此这里监听 Topic 级终态事件，而不是单条 Assistant Final。
	useEffect(() => {
		if (!enabled) return
		const unregister = superMagicStore.subscribe("topic.execution.ended", () => {
			if (waitingForShareAccess || isShareFilePreview || activeFileId !== file_id) return
			getFileVersion(file_id)
		})

		return () => {
			unregister()
		}
	}, [enabled, activeFileId, file_id, isShareFilePreview, waitingForShareAccess])

	return {
		loading,
		fileUrl,
		fileData,
		setFileData,
		fileVersion,
		changeFileVersion,
		fileVersionsList,
		fetchFileVersions,
		handleVersionRollback,
		isNewestVersion,
		isDeleted,
	}
}
