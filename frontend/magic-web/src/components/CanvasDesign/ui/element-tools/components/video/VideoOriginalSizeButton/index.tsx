import { RotateCcw } from "lucide-react"
import { useCallback, useState } from "react"
import { ElementTypeEnum } from "../../../../../runtime/document/types"
import { useCanvas } from "../../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../../app/providers/I18nProvider"
import { useCanvasUI } from "../../../../../app/providers/CanvasUIProvider"
import IconButton from "../../../../primitives/custom/IconButton/index"
import styles from "./index.module.css"
import { getActiveContent, getContentById } from "../../../../../runtime/document/elementContent"
import { useElementToolResolution } from "../../../model/ElementToolResolutionContext"

export default function VideoOriginalSizeButton() {
	const { t } = useCanvasDesignI18n()
	const { canvas } = useCanvas()
	const { selectedElements } = useCanvasUI()
	const tool = useElementToolResolution()
	const targetElementId = tool?.target.elementId
	const targetContentId = tool?.target.contentId
	const fallbackElement = selectedElements[0]
	const [isApplying, setIsApplying] = useState(false)

	const handleRestoreOriginalSize = useCallback(async () => {
		if (!canvas || isApplying) return

		const resolvedElementId = targetElementId ?? fallbackElement?.id
		if (!resolvedElementId) return
		const videoElement = canvas.elementManager.getElementData(resolvedElementId) as
			| (typeof selectedElements)[number]
			| undefined
		const videoContent =
			videoElement && videoElement.type === ElementTypeEnum.Video
				? tool
					? targetContentId
						? getContentById(videoElement, targetContentId)
						: undefined
					: getActiveContent(videoElement)
				: undefined
		if (!videoElement || videoElement.type !== ElementTypeEnum.Video || !videoContent?.src)
			return

		const elementWidth = videoElement.width ?? 0
		const elementHeight = videoElement.height ?? 0
		const longestEdge = Math.max(elementWidth, elementHeight)
		if (longestEdge <= 0) return

		setIsApplying(true)
		try {
			const resource = await canvas.videoResourceManager.getPreviewResource(videoContent.src)
			const videoWidth = resource?.metadata?.videoWidth ?? 0
			const videoHeight = resource?.metadata?.videoHeight ?? 0
			if (videoWidth <= 0 || videoHeight <= 0) return

			let nextWidth = longestEdge
			let nextHeight = longestEdge
			if (videoWidth >= videoHeight) {
				nextHeight = Math.max(1, Math.round((longestEdge * videoHeight) / videoWidth))
			} else {
				nextWidth = Math.max(1, Math.round((longestEdge * videoWidth) / videoHeight))
			}

			if (nextWidth === elementWidth && nextHeight === elementHeight) return

			if (tool) {
				await tool.execute({ width: nextWidth, height: nextHeight })
			} else {
				canvas.elementManager.update(videoElement.id, {
					width: nextWidth,
					height: nextHeight,
				})
			}
		} finally {
			setIsApplying(false)
		}
	}, [canvas, fallbackElement?.id, isApplying, targetContentId, targetElementId, tool])

	return (
		<IconButton
			onClick={() => {
				void handleRestoreOriginalSize()
			}}
			className={styles.videoOriginalSizeButton}
			disabled={isApplying}
		>
			<RotateCcw size={16} />
			<span className={styles.buttonText}>
				{t("elementTools.videoOriginalSize.title", "恢复原比例")}
			</span>
		</IconButton>
	)
}
