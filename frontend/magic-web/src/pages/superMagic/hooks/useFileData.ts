import { useFileAccess } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { useFileApi } from "@/pages/superMagic/fileAccess/fileApi"
import { isShareFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"
import { downloadFileContent } from "@/pages/superMagic/utils/api"
import { useEffect, useMemo, useRef, useState } from "react"
import { useDebounceEffect, useMemoizedFn } from "ahooks"
import { FileHistoryVersion, Topic } from "@/pages/superMagic/pages/Workspace/types"
import magicToast from "@/components/base/MagicToaster/utils"
import { useTranslation } from "react-i18next"
import useShareRoute from "./useShareRoute"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { SuperMagicApi } from "@/apis"
import { isNil } from "lodash-es"
import { superMagicStore } from "@/pages/superMagic/stores"

interface FileUrlCache {
	url: string
	updatedAt: string
	version?: number
}

export const useFileData = ({
	file_id,
	responseType = "text",
	isEditing = false,
	updatedAt,
	activeFileId: providedActiveFileId,
	isFromNode = false,
	content,
	disabledUrlCache = false,
	isSharePreview = false,
	enabled = true,
	loadContent = true,
	isTabActive,
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
	/** Load the file body through this hook. Version metadata can be loaded independently. */
	loadContent?: boolean
	/** Whether this renderer is the active file tab. */
	isTabActive?: boolean
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
	const [fileData, setFileData] = useState<any>(null)
	/** 文件版本 */
	const [fileVersion, setFileVersion] = useState<number>()
	/** 版本列表 */
	const [fileVersionsList, setFileVersionsList] = useState<FileHistoryVersion[]>([])
	/** 是否正在加载 */
	const [loading, setLoading] = useState(enabled && loadContent && isNil(content))
	/** 是否是删除的文件 */
	const [isDeleted, setIsDeleted] = useState(false)
	// Inactive cached tabs must not follow a stale parent activeFileId.
	const activeFileId =
		isTabActive === undefined ? providedActiveFileId : isTabActive ? file_id : null
	/** Track successfully loaded bytes across tab switches and share-token refreshes. */
	const loadedContentFileIdRef = useRef<string | null>(null)
	const [loadRevision, setLoadRevision] = useState(0)
	const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
	const [loadError, setLoadError] = useState<unknown>(null)
	const requestSequence = useRef(0)
	const historySequence = useRef(0)
	const refreshIntent = useRef(0)
	// Scope identity invalidates pending responses immediately, before the next
	// effect starts a request for another file, access token, version or edit mode.
	const requestScope = useMemo(
		() => ({ file_id, fileApi, updatedAt, isEditing, enabled }),
		[file_id, fileApi, updatedAt, isEditing, enabled],
	)
	const successfulLoadScope = useRef<typeof requestScope | null>(null)
	const currentScope = useRef(requestScope)
	currentScope.current = requestScope
	useEffect(
		() => () => {
			requestSequence.current += 1
			historySequence.current += 1
			refreshIntent.current += 1
		},
		[],
	)
	const beginLoad = useMemoizedFn(() => {
		const sequence = ++requestSequence.current
		setLoadStatus("loading")
		setLoadError(null)
		return { sequence, scope: requestScope }
	})
	const isCurrentLoad = useMemoizedFn(
		(request: ReturnType<typeof beginLoad>) =>
			request.sequence === requestSequence.current && request.scope === currentScope.current,
	)
	const finishLoad = useMemoizedFn(() => {
		successfulLoadScope.current = requestScope
		setLoadStatus("ready")
		setLoadError(null)
		setLoadRevision((revision) => revision + 1)
		setLoading(false)
	})
	const failLoad = useMemoizedFn((error: unknown) => {
		delete fileUrlCacheRef.current[currentScope.current.file_id]
		setLoadStatus("error")
		setLoadError(error)
		setLoading(false)
	})

	/** 智能更新文件 URL - 只有当更新时间或版本变化时才更新 */
	const updateFileUrlIfNeeded = useMemoizedFn(
		(newUrl: string, fileId: string, newUpdatedAt?: string, newVersion?: number) => {
			// 如果禁用缓存，直接更新 URL 并返回 true
			if (disabledUrlCache) {
				setFileUrl(newUrl)
				return true
			}
			const cachedData = fileUrlCacheRef.current[fileId]
			const currentUpdatedAt = newUpdatedAt || updatedAt || ""
			// 检查是否需要更新：没有缓存数据、更新时间不同、版本不同
			const shouldUpdate =
				!cachedData ||
				loadedContentFileIdRef.current !== fileId ||
				isNil(fileData) ||
				cachedData.updatedAt !== currentUpdatedAt ||
				cachedData.version !== newVersion

			if (shouldUpdate) {
				setFileUrl(newUrl)
				return true
			} else {
				return false
			}
		},
	)

	/** 更改文件版本 */
	const changeFileVersion = useMemoizedFn(
		(
			file_version: number | undefined,
			fileVersionsList?: FileHistoryVersion[],
			forceReload = false,
		) => {
			if (!enabled || !file_id) return
			if (waitingForShareAccess) return
			refreshIntent.current += 1
			const request = beginLoad()
			historySequence.current += 1
			// 获取文件下载地址
			return fileApi
				.getTemporaryDownloadUrl({
					file_ids: [file_id],
					file_versions: file_version ? { [file_id]: file_version } : undefined,
				})
				.then((res: any) => {
					if (!isCurrentLoad(request)) return
					if (res[0]?.url) {
						setIsDeleted(false)
						// 使用智能更新函数，只有当更新时间或版本变化时才更新 URL
						const urlUpdated = updateFileUrlIfNeeded(
							res[0]?.url,
							file_id,
							updatedAt,
							file_version,
						)
						setFileVersion(file_version)
						if (fileVersionsList) {
							setFileVersionsList(fileVersionsList)
						}
						pubsub.publish(
							PubSubEvents.Change_Preview_File_Version,
							file_id,
							file_version,
						)
						// 只有 URL 更新时才重新下载文件内容
						if (urlUpdated || forceReload) {
							return downloadFileContent(res[0]?.url, { responseType }).then(
								(data: any) => {
									if (!isCurrentLoad(request)) return
									// Only successful bytes may satisfy a later cache hit.
									loadedContentFileIdRef.current = file_id
									fileUrlCacheRef.current[file_id] = {
										url: res[0].url,
										updatedAt: updatedAt || "",
										version: file_version,
									}
									finishLoad()
									if (fileData === data) return
									setFileData(data)
									setLoading(false)
								},
							)
						} else {
							finishLoad()
						}
					} else {
						setIsDeleted(true)
						setLoading(false)
						magicToast.error(t("common.fileUrlFetchFailed"))
						return Promise.reject(new Error(t("common.fileUrlFetchFailed")))
					}
				})
				.catch((error) => {
					if (isCurrentLoad(request)) failLoad(error)
				})
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
		const scope = requestScope
		const sequence = ++historySequence.current
		if (isSelectNewest) {
			setLoadStatus("loading")
			setLoadError(null)
		}
		try {
			const res = await SuperMagicApi.getFileHistoryVersions({
				file_id: fileId,
				page_size: 10,
			})
			if (scope !== currentScope.current || sequence !== historySequence.current) return []
			if (res && res.list) {
				if (isSelectNewest && loadContent) {
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
			if (scope !== currentScope.current || sequence !== historySequence.current) return []
			if (isSelectNewest) failLoad(error)
			console.error("🚀 ~ CommonFooter ~ error:", error)
			setFileVersionsList([])
			return []
		}
	})

	/** User refresh always requests the latest bytes, even if no new version exists yet. */
	const refreshFile = useMemoizedFn(async () => {
		if (!enabled || isEditing || waitingForShareAccess) return
		setLoadStatus("loading")
		setLoadError(null)
		const intent = ++refreshIntent.current
		const scope = requestScope
		const versions = isShareFilePreview ? undefined : await fetchFileVersions(file_id)
		if (scope !== currentScope.current || intent !== refreshIntent.current) return
		await changeFileVersion(undefined, versions, true)
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

	// Tab activation is not a refresh. Reuse bytes only for the same access scope,
	// file revision and selected version; explicit refresh bypasses this guard.
	const hasReusableContent = useMemoizedFn(() => {
		const cached = fileUrlCacheRef.current[file_id]
		return (
			!disabledUrlCache &&
			successfulLoadScope.current === requestScope &&
			loadedContentFileIdRef.current === file_id &&
			!isNil(fileData) &&
			cached?.updatedAt === (updatedAt || "") &&
			cached?.version === fileVersion
		)
	})

	useDebounceEffect(
		() => {
			if (!enabled || waitingForShareAccess) return
			if (hasReusableContent()) return
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
			fileApi,
			activeFileId,
			updatedAt,
			file_id,
			isEditing,
			isShareFilePreview,
			fileData,
			hasReusableContent,
			waitingForShareAccess,
		],
		{
			wait: 100,
		},
	)

	const hasLoadedCurrentContent = useMemoizedFn(
		() => loadedContentFileIdRef.current === file_id && !isNil(fileData),
	)

	/** 针对 分享/工具预览/内容审查 等场景，单独获取文件的最新下载地址 */
	useEffect(() => {
		if (!enabled || !loadContent || !file_id) return
		if (waitingForShareAccess || (isShareFilePreview && !isShareFileAccess(fileAccess))) {
			setLoading(true)
			return
		}
		if (hasReusableContent()) return
		if (isShareFilePreview || !activeFileId || activeFileId !== file_id) {
			// Both active and background loaders own the same bytes. Preserve them
			// when changing tabs; a cached URL alone cannot restore cleared content.
			const keepExistingPreview = hasLoadedCurrentContent()
			if (!keepExistingPreview) {
				setLoading(true)
				setFileData(null)
			}
			let cancelled = false
			const request = beginLoad()
			// 获取文件下载地址
			fileApi
				.getTemporaryDownloadUrl({
					file_ids: [file_id],
				})
				.then((res: any) => {
					if (cancelled || !isCurrentLoad(request)) return
					// 使用智能更新函数
					const urlUpdated = updateFileUrlIfNeeded(
						res[0]?.url,
						file_id,
						updatedAt,
						undefined,
					)
					setFileVersion(undefined)
					if (res[0]?.url) {
						setIsDeleted(false)
						// 只有 URL 更新时才重新下载文件内容
						if (urlUpdated) {
							return downloadFileContent(res[0]?.url, { responseType }).then(
								(data: any) => {
									if (cancelled || !isCurrentLoad(request)) return
									loadedContentFileIdRef.current = file_id
									fileUrlCacheRef.current[file_id] = {
										url: res[0].url,
										updatedAt: updatedAt || "",
										version: undefined,
									}
									finishLoad()
									setFileData(data)
								},
							)
						}
						loadedContentFileIdRef.current = file_id
						finishLoad()
					} else {
						failLoad(new Error("File URL is unavailable"))
						setIsDeleted(true)
					}
				})
				.catch((error) => {
					if (cancelled || !isCurrentLoad(request)) return
					failLoad(error)
				})
			return () => {
				cancelled = true
			}
		}
	}, [
		activeFileId,
		hasLoadedCurrentContent,
		hasReusableContent,
		enabled,
		fileApi,
		file_id,
		isShareFilePreview,
		loadContent,
		shareAccessKey,
		waitingForShareAccess,
		fileAccess,
		updatedAt,
		isEditing,
		beginLoad,
		isCurrentLoad,
		finishLoad,
		failLoad,
		responseType,
		updateFileUrlIfNeeded,
	])

	useEffect(() => {
		if (!enabled) return
		pubsub.subscribe(PubSubEvents.Change_Preview_File, () => {
			setFileUrl("")
			setFileData(undefined)
			setFileVersion(undefined)
			setFileVersionsList([])
			// 清空 URL 缓存
			fileUrlCacheRef.current = {}
		})

		return () => {
			pubsub.unsubscribe(PubSubEvents.Change_Preview_File)
		}
	}, [enabled])

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
		refreshFile,
		loadStatus,
		loadRevision,
		loadError,
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
