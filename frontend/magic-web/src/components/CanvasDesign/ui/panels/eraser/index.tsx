import ImageEraserPanelRender from "./ImageEraserPanelRender"
import { useCanvasModeUI } from "../../../app/providers/CanvasUIProvider"

export default function ImageEraserPanel() {
	const { erasingElementId } = useCanvasModeUI()

	if (!erasingElementId) return null

	return <ImageEraserPanelRender />
}
