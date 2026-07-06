import { useCallback, useEffect, useRef } from "react"
import type {
	CanvasFileResourceMeta,
	GetFileInfoResponse,
} from "@/components/CanvasDesign/public/magic-types"
import { GET_FILE_INFO_NOT_FOUND_ERROR_CODE } from "@/components/CanvasDesign/runtime/resources/media-common/resourceLoadFailure"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import { useTranslation } from "react-i18next"
import {
	getFileInfoByPath,
	getFileResourceMetaByPath,
	getFileInfoById as getSharedFileInfoById,
	setFileInfoCache as setSharedFileInfoCache,
	cleanupFileInfoCache,
} from "../utils/designFileInfoCache"
import type { GetFileInfoResponseWithFileId } from "../utils/uploadCallbacks"

/**
 * 防抖延迟时间（毫秒）
 * 相同 path 的多次调用会在此时间窗口内合并
 */
const DEBOUNCE_DELAY_MS = 80

/**
 * 防抖项接口
 */
interface DebounceItem {
	timer: NodeJS.Timeout
	promise: Promise<GetFileInfoResponse>
	resolve: (value: GetFileInfoResponse) => void
	reject: (error: Error) => void
}

interface UseFileInfoProviderOptions {
	/** 已扁平化的附件列表（从入口传入） */
	flatAttachments?: FileItem[]
	/** 附件快照是否已由入口提供；观测过真实快照后，空数组也可能是一个有效快照 */
	attachmentsReady?: boolean
	/** 设计目录 ID，用于为 file info cache 建立命名空间 */
	designProjectId?: string
	/** 画布目录在项目中的路径段（与 magic.project.js 同级），用于解析 DSL 相对路径（如 `images/...` 或 `./images/...`） */
	designProjectBasePath?: string
	attachmentIndex?: DesignAttachmentIndex | null
}

interface UseFileInfoProviderReturn {
	getFileInfo: (
		path: string,
		options?: { useImageProcess?: boolean; forceRefresh?: boolean },
	) => Promise<GetFileInfoResponse>
	getFileResourceMeta: (
		path: string,
		options?: { useImageProcess?: boolean },
	) => Promise<CanvasFileResourceMeta>
	getFileInfoById: (
		fileId: string,
		fileName?: string,
		fileSize?: number,
	) => Promise<GetFileInfoResponseWithFileId>
	setFileInfoCache: (path: string, fileInfo: GetFileInfoResponse) => void
}

function createFileNotFoundByPathError(path: string, message: string): Error {
	const error = new Error(message) as Error & { code?: string; path?: string }
	error.code = GET_FILE_INFO_NOT_FOUND_ERROR_CODE
	error.path = path
	return error
}

function createFileInfoRequestCancelledError(): Error {
	const error = new Error("File info request cancelled")
	error.name = "AbortError"
	return error
}

/**
 * 文件信息提供功能 Hook
 * 职责：根据文件路径获取文件信息
 * - 通过 designFileInfoCache 获取文件信息（包含缓存和批量请求合并）
 * - 当文件列表变化时，清理已删除文件的缓存
 */
export function useFileInfoProvider(
	options: UseFileInfoProviderOptions,
): UseFileInfoProviderReturn {
	const {
		flatAttachments,
		attachmentsReady,
		designProjectBasePath,
		designProjectId,
		attachmentIndex,
	} = options
	const { t } = useTranslation("super")

	// 存储每个 path 的防抖项
	const debounceMapRef = useRef<Map<string, DebounceItem>>(new Map())

	// 当文件列表变化时，清理已删除文件的缓存
	useEffect(() => {
		cleanupFileInfoCache(flatAttachments, designProjectId, {
			hasAttachmentSnapshot: attachmentsReady === true,
		})
	}, [flatAttachments, designProjectId, attachmentsReady])

	// 组件卸载时清理所有防抖定时器
	useEffect(() => {
		const debounceMap = debounceMapRef.current
		return () => {
			const cancelledError = createFileInfoRequestCancelledError()
			debounceMap.forEach((item) => {
				clearTimeout(item.timer)
				item.reject(cancelledError)
			})
			debounceMap.clear()
		}
	}, [])

	/**
	 * 获取文件信息（带防抖）
	 * 通过 designFileInfoCache 的 getFileInfoByPath 获取文件信息
	 * 防抖按 path+options 分组，不同 options 不合并（返回的 URL 不同）
	 */
	const getFileInfo = useCallback(
		(
			path: string,
			opts?: { useImageProcess?: boolean; forceRefresh?: boolean },
		): Promise<GetFileInfoResponse> => {
			const debounceMap = debounceMapRef.current
			const base = designProjectBasePath
			const attachmentsSnapshotKey = attachmentIndex?.attachmentsSnapshotKey ?? ""
			const debounceKey = `${path}\0${opts?.useImageProcess === true ? "1" : "0"}\0${opts?.forceRefresh === true ? "1" : "0"}\0${base ?? ""}\0${attachmentsSnapshotKey}`
			const resolveFileInfo = async (
				resolve: (value: GetFileInfoResponse) => void,
				reject: (error: Error) => void,
			) => {
				try {
					const result = await getFileInfoByPath(path, flatAttachments, {
						...opts,
						designProjectBasePath: base,
						designProjectId,
						attachmentIndex,
						attachmentsSnapshotKeyOverride: attachmentIndex?.attachmentsSnapshotKey,
						hasAttachmentSnapshot: attachmentsReady === true,
					})
					if (!result) {
						reject(
							createFileNotFoundByPathError(
								path,
								t("design.errors.fileNotFoundByPath", { path }),
							),
						)
						return
					}
					resolve(result)
				} catch (error) {
					reject(error as Error)
				}
			}

			const existingItem = debounceMap.get(debounceKey)
			if (existingItem) {
				clearTimeout(existingItem.timer)
				const timer = setTimeout(async () => {
					debounceMap.delete(debounceKey)
					await resolveFileInfo(existingItem.resolve, existingItem.reject)
				}, DEBOUNCE_DELAY_MS)
				existingItem.timer = timer
				return existingItem.promise
			}

			const promiseCallbacks: {
				resolve: (value: GetFileInfoResponse) => void
				reject: (error: Error) => void
			} = {} as {
				resolve: (value: GetFileInfoResponse) => void
				reject: (error: Error) => void
			}
			const promise = new Promise<GetFileInfoResponse>((res, rej) => {
				promiseCallbacks.resolve = res
				promiseCallbacks.reject = rej
			})

			const timer = setTimeout(async () => {
				debounceMap.delete(debounceKey)
				await resolveFileInfo(promiseCallbacks.resolve, promiseCallbacks.reject)
			}, DEBOUNCE_DELAY_MS)

			debounceMap.set(debounceKey, {
				timer,
				promise,
				resolve: promiseCallbacks.resolve,
				reject: promiseCallbacks.reject,
			})
			return promise
		},
		[
			t,
			flatAttachments,
			attachmentsReady,
			designProjectBasePath,
			designProjectId,
			attachmentIndex,
		],
	)

	const getFileResourceMeta = useCallback(
		(path: string): Promise<CanvasFileResourceMeta> => {
			return getFileResourceMetaByPath(path, flatAttachments, {
				designProjectBasePath,
				attachmentIndex,
				hasAttachmentSnapshot: attachmentsReady === true,
			})
		},
		[flatAttachments, designProjectBasePath, attachmentIndex, attachmentsReady],
	)

	/**
	 * 通过 file_id 获取文件信息
	 * 优势：不依赖 path 和 attachments，直接使用 file_id 获取下载 URL
	 * 适用场景：上传完成后，API 已返回 file_id，但 attachments 可能还未更新
	 * 注意：这是 superMagic 上传回填专用链路，不作为 CanvasDesign 资源同一性标识。
	 */
	const getFileInfoById = useCallback(
		async (
			fileId: string,
			fileName?: string,
			fileSize?: number,
		): Promise<GetFileInfoResponseWithFileId> => {
			try {
				const result = await getSharedFileInfoById(fileId, fileName, fileSize, {
					filesList: flatAttachments,
				})
				return result
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : t("design.errors.getFileInfoFailed")
				throw new Error(errorMessage)
			}
		},
		[t, flatAttachments],
	)

	/**
	 * 设置文件信息缓存
	 * 用于外部直接设置缓存，避免重复调用 API
	 */
	const setFileInfoCache = useCallback(
		(path: string, fileInfo: GetFileInfoResponse) => {
			setSharedFileInfoCache(
				path,
				fileInfo,
				flatAttachments,
				designProjectBasePath,
				designProjectId,
				attachmentIndex,
			)
		},
		[flatAttachments, designProjectBasePath, designProjectId, attachmentIndex],
	)

	return {
		getFileInfo,
		getFileResourceMeta,
		getFileInfoById,
		setFileInfoCache,
	}
}
