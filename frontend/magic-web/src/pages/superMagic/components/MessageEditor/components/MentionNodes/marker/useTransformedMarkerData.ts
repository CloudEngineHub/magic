import { useEffect, useState, useRef } from "react"
import { reaction } from "mobx"
import { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { CanvasMarkerMentionData, MentionItemType } from "@/components/business/MentionPanel/types"
import {
	getCanvasMarkerMentionImagePath,
	normalizeCanvasMarkerMentionData,
} from "@/components/business/MentionPanel/utils/canvasMarkerMention"
import projectFilesStore from "@/stores/projectFiles"
import { getFileInfoByPath } from "@/pages/superMagic/components/Detail/contents/Design/utils/designFileInfoCache"
import { resolveDesignProjectBasePathFromAttachments } from "@/pages/superMagic/components/Detail/contents/Design/utils/utils"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import { mapWorkspaceFilesToFileItems } from "./markerAttachmentUtils"

async function hydrateMarkerImageSize(
	markerData: CanvasMarkerMentionData,
	currentProjectFilesStore: ProjectFilesStore,
): Promise<CanvasMarkerMentionData | null> {
	const imagePath = getCanvasMarkerMentionImagePath(markerData)
	if (!imagePath) return markerData

	const workspaceFiles = mapWorkspaceFilesToFileItems(currentProjectFilesStore.workspaceFilesList)
	const designProjectBasePath = resolveDesignProjectBasePathFromAttachments({
		currentFile: markerData.design_project_id
			? { id: markerData.design_project_id }
			: undefined,
		flatAttachments: workspaceFiles,
	})
	const fileInfo = await getFileInfoByPath(imagePath, workspaceFiles, {
		useImageProcess: true,
		designProjectId: markerData.design_project_id,
		designProjectBasePath,
	})
	if (!fileInfo?.src) {
		return markerData
	}

	const img = new Image()
	img.crossOrigin = "anonymous"
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve()
		img.onerror = () =>
			reject(new Error("Marker image failed to load while hydrating its dimensions"))
		img.src = fileInfo.src
	})

	const naturalWidth = img.naturalWidth
	const naturalHeight = img.naturalHeight

	return {
		...markerData,
		element_width: naturalWidth,
		element_height: naturalHeight,
	}
}

export function useTransformedMarkerData(
	data: TiptapMentionAttributes,
	isInMessageList: boolean,
	projectFilesStoreInstance?: ProjectFilesStore,
): { markerData: CanvasMarkerMentionData | null; loading: boolean } {
	const [transformedData, setTransformedData] = useState<CanvasMarkerMentionData | null>(null)
	const [loading, setLoading] = useState(false)
	const cancelledRef = useRef(false)
	const markerDataRef = useRef<CanvasMarkerMentionData | null>(null)
	const currentProjectFilesStore = projectFilesStoreInstance ?? projectFilesStore

	const performHydrate = (markerData: CanvasMarkerMentionData) => {
		if (!getCanvasMarkerMentionImagePath(markerData)) {
			setTransformedData(null)
			setLoading(false)
			return
		}

		if (
			!currentProjectFilesStore.workspaceFilesList ||
			currentProjectFilesStore.workspaceFilesList.length === 0
		) {
			setTransformedData(null)
			setLoading(true)
			return
		}

		setLoading(true)
		hydrateMarkerImageSize(markerData, currentProjectFilesStore)
			.then((result) => {
				if (!cancelledRef.current) {
					setTransformedData(result)
				}
			})
			.catch((error) => {
				console.error("[useTransformedMarkerData] Failed to hydrate marker data:", error)
				if (!cancelledRef.current) {
					setTransformedData(markerData)
				}
			})
			.finally(() => {
				if (!cancelledRef.current) {
					setLoading(false)
				}
			})
	}

	useEffect(() => {
		cancelledRef.current = false

		if (data.type !== MentionItemType.DESIGN_MARKER) {
			setTransformedData(null)
			setLoading(false)
			markerDataRef.current = null
			return
		}

		const markerData = normalizeCanvasMarkerMentionData(data.data)

		if (!markerData) {
			setTransformedData(null)
			setLoading(false)
			markerDataRef.current = null
			return
		}

		// 编辑态和已带尺寸的消息态可直接渲染；旧消息缺尺寸时再异步补图像尺寸，供 tooltip 定位使用。
		if (!isInMessageList || markerData.element_width || markerData.element_height) {
			setTransformedData(markerData)
			setLoading(false)
			markerDataRef.current = null
			return
		}

		markerDataRef.current = markerData
		performHydrate(markerData)

		return () => {
			cancelledRef.current = true
		}
	}, [currentProjectFilesStore, data, isInMessageList])

	useEffect(() => {
		if (!isInMessageList || !markerDataRef.current) {
			return
		}

		// 历史消息刷新时附件列表可能晚于消息到达，等附件加载后再补一次图片尺寸。
		const disposer = reaction(
			() => currentProjectFilesStore.workspaceFilesList,
			(attachmentList) => {
				if (
					attachmentList &&
					attachmentList.length > 0 &&
					markerDataRef.current &&
					!cancelledRef.current
				) {
					performHydrate(markerDataRef.current)
				}
			},
			{ fireImmediately: false },
		)

		return () => {
			disposer()
		}
	}, [currentProjectFilesStore, isInMessageList])

	return { markerData: transformedData, loading }
}
