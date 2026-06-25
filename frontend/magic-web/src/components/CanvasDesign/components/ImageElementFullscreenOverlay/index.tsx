import { useEffect } from "react"
import { ElementTypeEnum, type ImageElement } from "../../canvas/types"
import { useCanvasElement } from "../../hooks/useCanvasElement"
import ImageFullscreenOverlay from "../ImageFullscreenOverlay"

interface ImageElementFullscreenOverlayProps {
	elementId: string
	onClose: () => void
}

/** 画布图片元素全屏层：裁剪元素默认展示裁剪图，并可切换到原图。 */
export default function ImageElementFullscreenOverlay(props: ImageElementFullscreenOverlayProps) {
	const { elementId, onClose } = props
	const element = useCanvasElement(elementId)
	const imageElement = element?.type === ElementTypeEnum.Image ? (element as ImageElement) : null
	const imagePath = imageElement?.src ?? ""

	useEffect(() => {
		if (imageElement && imagePath) {
			return
		}
		onClose()
	}, [imageElement, imagePath, onClose])

	return (
		<ImageFullscreenOverlay
			path={imagePath}
			crop={imageElement?.crop}
			isOpen={Boolean(imagePath)}
			onClose={onClose}
		/>
	)
}
