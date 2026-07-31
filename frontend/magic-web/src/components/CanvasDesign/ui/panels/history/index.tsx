import { useCallback, useEffect, useMemo, useState } from "react"
import ImageMessageHistoryRender from "./ImageMessageHistoryRender"
import VideoMessageHistoryRender from "./VideoMessageHistoryRender"
import { useCanvasPanelUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvasElement, useGenerationRuntime } from "../../../app/hooks/canvas"
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

	const element = useCanvasElement(messageHistoryElementId)
	const generationRuntime = useGenerationRuntime(messageHistoryElementId)

	useEffect(() => {
		setPreviewingMediaResource(null)
	}, [messageHistoryElementId])

	const panel = useMemo(() => {
		if (!messageHistoryElementId || !element) return null
		if (element.id !== messageHistoryElementId) return null

		if (
			element.type === ElementTypeEnum.Image &&
			(generationRuntime?.generateImageRequest || element.generateImageRequest)
		) {
			return (
				<ImageMessageHistoryRender
					key={element.id}
					imageElement={element as ImageElement}
					onPreviewMediaResource={setPreviewingMediaResource}
				/>
			)
		}

		if (
			element.type === ElementTypeEnum.Video &&
			(generationRuntime?.generateVideoRequest || element.generateVideoRequest)
		) {
			return (
				<VideoMessageHistoryRender
					key={element.id}
					videoElement={element as VideoElement}
					onPreviewMediaResource={setPreviewingMediaResource}
				/>
			)
		}

		return null
	}, [messageHistoryElementId, element, generationRuntime])

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
