import { useEffect, useState, useRef } from "react"
import { reaction } from "mobx"
import { getFileInfoByPath } from "@/pages/superMagic/components/Detail/contents/Design/utils/designFileInfoCache"
import { resolveDesignProjectBasePathFromAttachments } from "@/pages/superMagic/components/Detail/contents/Design/utils/utils"
import projectFilesStore, { type ProjectFilesStore } from "@/stores/projectFiles"
import { mapWorkspaceFilesToFileItems } from "./markerAttachmentUtils"

function normalizePath(path: string) {
	if (!path) return ""
	return path.replace(/^\/+|\/+$/g, "")
}

function resolveCurrentDesignProjectBasePath(
	currentProjectFilesStore: ProjectFilesStore,
	designProjectId?: string,
) {
	// 刷新首屏时 workspaceFilesList 可能尚未加载，必须在每次换链前用最新附件列表重新计算 base path。
	return resolveDesignProjectBasePathFromAttachments({
		currentFile: designProjectId ? { id: designProjectId } : undefined,
		flatAttachments: mapWorkspaceFilesToFileItems(currentProjectFilesStore.workspaceFilesList),
	})
}

export function useMarkerImageUrl(
	imagePath: string | undefined,
	designProjectId?: string,
	projectFilesStoreInstance?: ProjectFilesStore,
): {
	imageUrl: string | null
	loading: boolean
} {
	const [imageUrl, setImageUrl] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const cancelledRef = useRef(false)
	const currentProjectFilesStore = projectFilesStoreInstance ?? projectFilesStore
	const designProjectBasePath = resolveCurrentDesignProjectBasePath(
		currentProjectFilesStore,
		designProjectId,
	)

	useEffect(() => {
		cancelledRef.current = false

		if (!imagePath) {
			setImageUrl(null)
			setLoading(false)
			return
		}

		const normalizedPath = normalizePath(imagePath)
		if (!normalizedPath) {
			setImageUrl(null)
			setLoading(false)
			return
		}

		if (
			!currentProjectFilesStore.workspaceFilesList ||
			currentProjectFilesStore.workspaceFilesList.length === 0
		) {
			setImageUrl(null)
			setLoading(true)
			return
		}

		setLoading(true)
		getFileInfoByPath(
			imagePath,
			mapWorkspaceFilesToFileItems(currentProjectFilesStore.workspaceFilesList),
			{
				useImageProcess: true,
				designProjectId,
				designProjectBasePath,
			},
		)
			.then((fileInfo) => {
				if (!cancelledRef.current) {
					setImageUrl(fileInfo?.src ?? null)
				}
			})
			.catch((error) => {
				console.error("[useMarkerImageUrl] Failed to load image URL:", error)
				if (!cancelledRef.current) {
					setImageUrl(null)
				}
			})
			.finally(() => {
				if (!cancelledRef.current) {
					setLoading(false)
				}
			})

		return () => {
			cancelledRef.current = true
		}
	}, [currentProjectFilesStore, designProjectBasePath, designProjectId, imagePath])

	useEffect(() => {
		if (!imagePath) return

		const disposer = reaction(
			() => currentProjectFilesStore.workspaceFilesList,
			(attachmentList) => {
				if (
					attachmentList &&
					attachmentList.length > 0 &&
					imagePath &&
					!cancelledRef.current
				) {
					const latestDesignProjectBasePath = resolveCurrentDesignProjectBasePath(
						currentProjectFilesStore,
						designProjectId,
					)
					// MobX reaction 不会触发当前组件重新 render，不能复用首次 render 闭包里的 designProjectBasePath。
					setLoading(true)
					getFileInfoByPath(
						imagePath,
						mapWorkspaceFilesToFileItems(currentProjectFilesStore.workspaceFilesList),
						{
							useImageProcess: true,
							designProjectId,
							designProjectBasePath: latestDesignProjectBasePath,
						},
					)
						.then((fileInfo) => {
							if (!cancelledRef.current) {
								setImageUrl(fileInfo?.src ?? null)
							}
						})
						.catch((error) => {
							console.error("[useMarkerImageUrl] Failed to reload image URL:", error)
							if (!cancelledRef.current) {
								setImageUrl(null)
							}
						})
						.finally(() => {
							if (!cancelledRef.current) {
								setLoading(false)
							}
						})
				}
			},
			{ fireImmediately: false },
		)

		return () => {
			disposer()
		}
	}, [currentProjectFilesStore, designProjectBasePath, designProjectId, imagePath])

	return { imageUrl, loading }
}
