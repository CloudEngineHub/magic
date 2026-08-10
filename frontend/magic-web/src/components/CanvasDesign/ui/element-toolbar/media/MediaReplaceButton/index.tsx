import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { RefreshCw } from "lucide-react"
import { useCanvasEvent } from "../../../../app/hooks/canvas"
import { useCanvas } from "../../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../../app/providers/I18nProvider"
import { useCanvasUI } from "../../../../app/providers/CanvasUIProvider"
import { getActiveContent } from "../../../../runtime/document/elementContent"
import {
	ElementTypeEnum,
	type CanvasFileElement,
	type LayerElement,
} from "../../../../runtime/document/types"
import { GenerationStatus } from "../../../../public/magic-types"
import IconButton from "../../../primitives/custom/IconButton/index"
import styles from "../../download/DownloadButton/index.module.css"

function isMediaElement(element: LayerElement | undefined): element is CanvasFileElement {
	return (
		element?.type === ElementTypeEnum.Image ||
		element?.type === ElementTypeEnum.Video ||
		element?.type === ElementTypeEnum.Audio
	)
}

export default function MediaReplaceButton() {
	const { canvas } = useCanvas()
	const { selectedElements } = useCanvasUI()
	const { t } = useCanvasDesignI18n()
	const [replacingElementId, setReplacingElementId] = useState<string | null>(
		() => canvas?.mediaReplaceController?.getReplacingElementId?.() ?? null,
	)
	const selected = selectedElements[0]
	const selectedMedia = isMediaElement(selected) ? selected : undefined
	const activeContent = selectedMedia ? getActiveContent(selectedMedia) : undefined
	const activeStatus =
		activeContent && "status" in activeContent ? activeContent.status : undefined
	const activeIsProcessing =
		activeStatus === GenerationStatus.Pending || activeStatus === GenerationStatus.Processing
	const isReplacing = replacingElementId === selectedMedia?.id
	const isReplacementBusy = replacingElementId !== null
	const hasSource = Boolean(activeContent?.src)

	useEffect(() => {
		setReplacingElementId(canvas?.mediaReplaceController?.getReplacingElementId?.() ?? null)
	}, [canvas])

	useCanvasEvent(
		"element:media:replaceStateChanged",
		useCallback(({ data }) => {
			setReplacingElementId((current) => {
				if (data.status === "uploading" || data.status === "applying") {
					return data.elementId
				}
				return current === data.elementId ? null : current
			})
		}, []),
		[],
	)

	const handleReplace = (event: MouseEvent<HTMLDivElement>) => {
		if (!canvas || canvas.readonly || !selectedMedia || activeIsProcessing || isReplacementBusy)
			return
		canvas.eventEmitter.emit({
			type: "element:media:replaceClick",
			data: {
				elementId: selectedMedia.id,
				mediaType: selectedMedia.type,
				contentId: activeContent?.contentId ?? null,
				anchorElement: event.currentTarget,
			},
		})
	}

	const label = (() => {
		if (isReplacing) return t("elementTools.mediaReplace.replacing", "替换中")
		switch (selectedMedia?.type) {
			case ElementTypeEnum.Image:
				return hasSource
					? t("elementTools.mediaReplace.image", "替换图片")
					: t("elementTools.mediaReplace.uploadImage", "上传图片")
			case ElementTypeEnum.Video:
				return hasSource
					? t("elementTools.mediaReplace.video", "替换视频")
					: t("elementTools.mediaReplace.uploadVideo", "上传视频")
			case ElementTypeEnum.Audio:
				return hasSource
					? t("elementTools.mediaReplace.audio", "替换音频")
					: t("elementTools.mediaReplace.uploadAudio", "上传音频")
			default:
				return t("elementTools.mediaReplace.title", "替换媒体")
		}
	})()

	return (
		<IconButton
			onClick={handleReplace}
			className={styles.downloadButton}
			title={label}
			disabled={
				!canvas ||
				canvas.readonly ||
				!selectedMedia ||
				activeIsProcessing ||
				isReplacementBusy
			}
		>
			<RefreshCw size={16} />
			<span className={styles.buttonText}>{label}</span>
		</IconButton>
	)
}
