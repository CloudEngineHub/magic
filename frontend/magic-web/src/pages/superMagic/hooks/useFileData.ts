import { useFileAccess } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { useFileApi } from "@/pages/superMagic/fileAccess/fileApi"
import { isShareFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"
import { downloadFileContent, type GetTemporaryDownloadUrlItem } from "@/pages/superMagic/utils/api"
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
import { invalidateSharedMediaUrl } from "@/pages/superMagic/services/sharedMediaUrlCache"

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
	useSharedMediaUrlCache = false,
	skipContentDownload = false,
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
	/** 图片地址由共享媒体缓存复用，保留访问身份、版本和过期判断。 */
	useSharedMediaUrlCache?: boolean
	/** 图片只消费地址，不通过此 Hook 下载文件正文。 */
	skipContentDownload?: boolean
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
	const selectedVersionRef = useRef<number>()
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
		() => ({
			file_id,
			fileApi,
			updatedAt,
			responseType,
			isEditing,
			enabled,
			loadContent,
			skipContentDownload,
			useSharedMediaUrlCache,
		}),
		[
			file_id,
			fileApi,
			updatedAt,
			responseType,
			isEditing,
			enabled,
			loadContent,
			skipContentDownload,
			useSharedMediaUrlCache,
		],
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

	const requestFileUrl = useMemoizedFn(
		async (
			fileVersion?: number,
			forceRefresh = false,
		): Promise<GetTemporaryDownloadUrlItem | null> => {
			if (useSharedMediaUrlCache && !disabledUrlCache) {
				const items = await fileApi.requestSharedMediaUrls([file_id], {
					fileVersions:
						fileVersion === undefined ? undefined : { [file_id]: fileVersion },
					fileUpdatedAtMap:
						updatedAt === undefined ? undefined : { [file_id]: updatedAt },
					forceRefresh,
				})
				return items[0] ?? null
			}
			const items = await fileApi.getTemporaryDownloadUrl({
				file_ids: [file_id],
				file_versions: fileVersion ? { [file_id]: fileVersion } : undefined,
			})
			return items[0] ?? null
		},
	)

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
				cachedData.url !== newUrl ||
				successfulLoadScope.current !== requestScope ||
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
			selectedVersionRef.current = file_version
			refreshIntent.current += 1
			const request = beginLoad()
			historySequence.current += 1
			// 获取文件下载地址
			return requestFileUrl(file_version, forceReload)
				.then((item) => {
					if (!isCurrentLoad(request)) return
					if (item?.url) {
						setIsDeleted(false)
						// 使用智能更新函数，只有当更新时间或版本变化时才更新 URL
						const urlUpdated = updateFileUrlIfNeeded(
							item.url,
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
						// 地址模式不伪造已下载正文；仍通过当前请求检查和完成状态保护版本切换。
						if (skipContentDownload) {
							loadedContentFileIdRef.current = file_id
							fileUrlCacheRef.current[file_id] = {
								url: item.url,
								updatedAt: updatedAt || "",
								version: file_version,
							}
							setFileUrl(item.url)
							finishLoad()
							return
						}
						// 只有 URL 更新时才重新下载文件内容
						if (urlUpdated || forceReload) {
							return downloadFileContent(item.url, { responseType }).then(
								(data: any) => {
									if (!isCurrentLoad(request)) return
									// Only successful bytes may satisfy a later cache hit.
									loadedContentFileIdRef.current = file_id
									fileUrlCacheRef.current[file_id] = {
										url: item.url,
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
				if (
					isSelectNewest &&
					loadContent &&
					selectedVersionRef.current === undefined &&
					!isEditing
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
		// 文件身份或正文类型改变后，旧版本选择及成功缓存不能用于新资源。
		selectedVersionRef.current = undefined
		fileUrlCacheRef.current = {}
		loadedContentFileIdRef.current = null
		setFileUrl("")
		setFileData(null)
		setFileVersion(undefined)
		setFileVersionsList([])
	}, [file_id, responseType])

	// Tab activation is not a refresh. Reuse bytes only for the same access scope,
	// file revision and selected version; explicit refresh bypasses this guard.
	const hasReusableContent = useMemoizedFn(() => {
		const cached = fileUrlCacheRef.current[file_id]
		return (
			!disabledUrlCache &&
			successfulLoadScope.current === requestScope &&
			loadedContentFileIdRef.current === file_id &&
			(skipContentDownload || !isNil(fileData)) &&
			(skipContentDownload ? !!cached?.url : true) &&
			cached?.updatedAt === (updatedAt || "") &&
			cached?.version === selectedVersionRef.current
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
			const isViewingHistoryVersion = selectedVersionRef.current !== undefined
			// 历史正文未加载完成就切换标签时，重新激活后恢复同一版本的读取。
			if (isViewingHistoryVersion && loadContent) {
				void changeFileVersion(selectedVersionRef.current)
			}
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
			changeFileVersion,
			responseType,
			loadContent,
			waitingForShareAccess,
		],
		{
			wait: 100,
		},
	)

	const hasLoadedCurrentContent = useMemoizedFn(() =>
		skipContentDownload
			? successfulLoadScope.current?.file_id === file_id && !!fileUrl
			: loadedContentFileIdRef.current === file_id && !isNil(fileData),
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
			// 后台预览与前台版本选择读取同一版本，不能在标签切换时改回最新版本。
			const version = selectedVersionRef.current
			const request = beginLoad()
			// 获取文件下载地址
			requestFileUrl(version)
				.then((item) => {
					if (cancelled || !isCurrentLoad(request)) return
					// 使用智能更新函数
					const urlUpdated = updateFileUrlIfNeeded(
						item?.url ?? "",
						file_id,
						updatedAt,
						version,
					)
					setFileVersion(version)
					if (item?.url) {
						setIsDeleted(false)
						if (skipContentDownload) {
							loadedContentFileIdRef.current = file_id
							fileUrlCacheRef.current[file_id] = {
								url: item.url,
								updatedAt: updatedAt || "",
								version,
							}
							setFileUrl(item.url)
							finishLoad()
							return
						}
						// 只有 URL 更新时才重新下载文件内容
						if (urlUpdated) {
							return downloadFileContent(item.url, { responseType }).then(
								(data: any) => {
									if (cancelled || !isCurrentLoad(request)) return
									loadedContentFileIdRef.current = file_id
									fileUrlCacheRef.current[file_id] = {
										url: item.url,
										updatedAt: updatedAt || "",
										version,
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
		requestFileUrl,
		skipContentDownload,
		useSharedMediaUrlCache,
	])

	useEffect(() => {
		if (!enabled) return
		pubsub.subscribe(PubSubEvents.Change_Preview_File, () => {
			requestSequence.current += 1
			historySequence.current += 1
			refreshIntent.current += 1
			selectedVersionRef.current = undefined
			if (useSharedMediaUrlCache) invalidateSharedMediaUrl(file_id)
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
	}, [enabled, file_id, useSharedMediaUrlCache])

	// 由于后端的文件版本生成机制，是在每一轮 Topic 执行结束时生成，
	// 因此这里监听 Topic 级终态事件，而不是单条 Assistant Final。
	useEffect(() => {
		if (!enabled) return
		const unregister = superMagicStore.subscribe("topic.execution.ended", () => {
			if (waitingForShareAccess || isShareFilePreview || activeFileId !== file_id) return
			if (useSharedMediaUrlCache) invalidateSharedMediaUrl(file_id)
			getFileVersion(file_id)
		})

		return () => {
			unregister()
		}
	}, [
		enabled,
		activeFileId,
		file_id,
		isShareFilePreview,
		waitingForShareAccess,
		useSharedMediaUrlCache,
	])

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
