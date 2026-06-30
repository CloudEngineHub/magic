import { useCallback, useRef } from "react"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	getOrCreateImagesDirFileId,
	type GetOrCreateImagesDirFileIdResult,
	validateUploadDirectoryFileId,
} from "../utils/designAssetDirectory"
import { buildImagesDirCacheKey } from "./uploadSubDirCacheKey"

export type GetOrCreateImagesDirFn = () => Promise<GetOrCreateImagesDirFileIdResult | null>

interface UseGetOrCreateImagesDirParams {
	currentFile?: { id: string; name: string }
	flatAttachments?: FileItem[]
	projectId?: string
	updateAttachments: () => void
}

/**
 * 获取或创建 images 目录的 Hook
 * 在顶层（如 useDesignMethods）调用一次，将返回的函数向下传递
 * 首次调用创建并存储 promise，同参数下的后续调用复用同一 promise
 */
export function useGetOrCreateImagesDir(
	params: UseGetOrCreateImagesDirParams,
): GetOrCreateImagesDirFn {
	const { currentFile, flatAttachments, projectId, updateAttachments } = params
	const cacheKey = buildImagesDirCacheKey({ projectId, currentFile, flatAttachments })
	const cacheRef = useRef<{
		key: string
		promise: Promise<GetOrCreateImagesDirFileIdResult | null>
		result?: GetOrCreateImagesDirFileIdResult | null
	} | null>(null)

	const validateImagesDirFileId = useCallback(validateUploadDirectoryFileId, [])

	const isCachedResultUsable = useCallback(
		async (result: GetOrCreateImagesDirFileIdResult | null): Promise<boolean> => {
			if (!result?.imagesDirFileId) return false
			return validateImagesDirFileId(result.imagesDirFileId)
		},
		[validateImagesDirFileId],
	)

	const getOrCreateImagesDir =
		useCallback(async (): Promise<GetOrCreateImagesDirFileIdResult | null> => {
			if (!projectId) return null

			const cached = cacheRef.current
			if (cached && cached.key === cacheKey) {
				if (cached.result !== undefined) {
					if (await isCachedResultUsable(cached.result)) {
						return cached.result
					}
					cacheRef.current = null
				} else {
					const result = await cached.promise
					if (await isCachedResultUsable(result)) {
						return result
					}
					cacheRef.current = null
				}
			}

			const promise = getOrCreateImagesDirFileId({
				currentFile,
				flatAttachments,
				projectId,
				updateAttachments,
				validateImagesDirFileId,
			})

			cacheRef.current = { key: cacheKey, promise }

			promise
				.then((result) => {
					if (cacheRef.current && cacheRef.current.key === cacheKey) {
						cacheRef.current.result = result
					}
				})
				.catch(() => {
					if (cacheRef.current?.key === cacheKey) {
						cacheRef.current = null
					}
				})

			return promise
		}, [
			cacheKey,
			currentFile,
			flatAttachments,
			projectId,
			updateAttachments,
			validateImagesDirFileId,
			isCachedResultUsable,
		])

	return getOrCreateImagesDir
}
