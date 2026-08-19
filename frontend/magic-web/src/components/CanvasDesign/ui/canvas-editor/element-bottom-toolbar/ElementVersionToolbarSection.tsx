import { useMemo } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type { AudioElement, ImageElement, VideoElement } from "../../../runtime/document/types"
import { getContents } from "../../../runtime/document/elementContent"
import { isContentVersionOperations } from "../../../runtime/elements/core/ContentVersionOperations"
import { useElementBottomToolbarSection } from "./ElementBottomToolbarContext"
import ElementVersionControls from "./ElementVersionControls"

type VersionElement = ImageElement | VideoElement | AudioElement

export function useElementVersionToolbarSection(
	element: VersionElement | null,
	visible = true,
): void {
	const { canvas } = useCanvas()
	const section = useMemo(() => {
		if (!element || !visible || getContents(element).length <= 1) return null
		const instance = canvas?.elementManager.getElementInstance(element.id)
		if (!isContentVersionOperations(instance)) return null
		return {
			id: "versions",
			elementId: element.id,
			order: 20,
			group: "versions",
			content: <ElementVersionControls element={element} />,
		}
	}, [canvas, element, visible])

	useElementBottomToolbarSection(section)
}
