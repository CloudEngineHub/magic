import { useMemo } from "react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import {
	useCanvasModeUI,
	useCanvasPanelUI,
	useCanvasSelectionUI,
} from "../../../app/providers/CanvasUIProvider"
import {
	ElementTypeEnum,
	type AudioElement,
	type ImageElement,
	type VideoElement,
} from "../../../runtime/document/types"
import { getContents } from "../../../runtime/document/elementContent"
import ElementVersionControls from "./ElementVersionControls"
import { ElementBottomToolbar } from "./ElementBottomToolbar"
import { useElementBottomToolbarSections } from "./ElementBottomToolbarContext"
import { isContentVersionOperations } from "../../../runtime/elements/core/ContentVersionOperations"

type VersionElement = ImageElement | VideoElement | AudioElement

function isVersionElement(element: unknown): element is VersionElement {
	if (!element || typeof element !== "object") return false
	const type = (element as { type?: string }).type
	return (
		type === ElementTypeEnum.Image ||
		type === ElementTypeEnum.Video ||
		type === ElementTypeEnum.Audio
	)
}

export default function ElementBottomToolbarHost() {
	const { canvas } = useCanvas()
	const { selectedElements, isDragging, isSelecting, subElementTooltip } = useCanvasSelectionUI()
	const { croppingElementId, extendingElementId, erasingElementId } = useCanvasModeUI()
	const { fullscreenMediaElement } = useCanvasPanelUI()
	const { t } = useCanvasDesignI18n()
	const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null
	const element = selectedElement && isVersionElement(selectedElement) ? selectedElement : null
	const sections = useElementBottomToolbarSections(element?.id ?? null)
	const versionSection = useMemo(() => {
		if (!element || getContents(element).length <= 1) return null
		if (!isContentVersionOperations(canvas?.elementManager.getElementInstance(element.id))) {
			return null
		}
		return {
			id: "versions",
			order: 20,
			group: "versions",
			content: <ElementVersionControls element={element} />,
		}
	}, [canvas, element])
	const allSections = useMemo(
		() =>
			(versionSection ? [...sections, versionSection] : sections).sort(
				(left, right) => (left.order ?? 0) - (right.order ?? 0),
			),
		[sections, versionSection],
	)
	const shouldShow = Boolean(
		element &&
		allSections.length > 0 &&
		!isDragging &&
		!isSelecting &&
		!subElementTooltip &&
		!croppingElementId &&
		!extendingElementId &&
		!erasingElementId &&
		!fullscreenMediaElement &&
		!element.locked,
	)

	return (
		<ElementBottomToolbar
			floatingId="element-bottom-toolbar"
			ariaLabel={t("elementBottomToolbar.label", "元素底部工具栏")}
			sections={allSections}
			shouldShow={() => shouldShow}
		/>
	)
}
