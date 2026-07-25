import { useCallback, useEffect, useMemo, useState } from "react"
import ImageMessageHistoryRender from "./ImageMessageHistoryRender"
import VideoMessageHistoryRender from "./VideoMessageHistoryRender"
import { useCanvasPanelUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvasElement } from "../../../app/hooks/canvas"
import {
	ElementTypeEnum,
	type ImageElement,
	type VideoElement,
} from "../../../runtime/document/types"
import MediaResourceFullscreenPreview, {
	type MediaResourceFullscreenPreviewItem,
} from "../../fullscreen/media-resource/index"

export default function MessageHistory() {
	const { messageHistoryElementId } = useCanvasPanelUI()
	const [previewingMediaResource, setPreviewingMediaResource] =
		useState<MediaResourceFullscreenPreviewItem | null>(null)

	const handleCloseMediaPreview = useCallback(() => {
		setPreviewingMediaResource(null)
	}, [])

	// 提交接口确认前的配置是瞬时数据，也需要立即刷新已打开的生成记录面板。
	const element = useCanvasElement(messageHistoryElementId, { includeTransient: true })

	useEffect(() => {
		setPreviewingMediaResource(null)
	}, [messageHistoryElementId])

	const panel = useMemo(() => {
		if (!messageHistoryElementId || !element) return null
		if (element.id !== messageHistoryElementId) return null

		if (element.type === ElementTypeEnum.Image && element.generateImageRequest) {
			return (
				<ImageMessageHistoryRender
					key={element.id}
					imageElement={element as ImageElement}
					onPreviewMediaResource={setPreviewingMediaResource}
				/>
			)
		}

		if (element.type === ElementTypeEnum.Video && element.generateVideoRequest) {
			return (
				<VideoMessageHistoryRender
					key={element.id}
					videoElement={element as VideoElement}
					onPreviewMediaResource={setPreviewingMediaResource}
				/>
			)
		}

		return null
	}, [messageHistoryElementId, element])

	if (!panel) return null

	return (
		<>
			{panel}
			<MediaResourceFullscreenPreview
				resource={previewingMediaResource}
				onClose={handleCloseMediaPreview}
			/>
		</>
	)
}
