import { useCanvasRenameUI } from "../../../app/providers/CanvasUIProvider"
import { useCanvasElement } from "../../../app/hooks/canvas"
import ElementRenameOverlayRender from "./ElementRenameOverlayRender"
import ImageRenamePanel from "./ImageRenamePanel"
import { isImageElementContent } from "../../../runtime/document/elementContent"
import NameLabelRenameButton from "./NameLabelRenameButton"

export default function ElementRenameOverlay() {
	const { canvasRenamingElementId } = useCanvasRenameUI()
	const element = useCanvasElement(canvasRenamingElementId)

	if (!canvasRenamingElementId || !element || element.id !== canvasRenamingElementId) {
		return <NameLabelRenameButton />
	}

	return isImageElementContent(element) && element.contents.length > 1 ? (
		<ImageRenamePanel key={element.id} element={element} />
	) : (
		<ElementRenameOverlayRender key={element.id} elementId={canvasRenamingElementId} />
	)
}
