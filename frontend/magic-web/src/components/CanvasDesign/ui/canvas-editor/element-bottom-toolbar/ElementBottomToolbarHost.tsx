import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
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
import { ElementBottomToolbar } from "./ElementBottomToolbar"
import { useElementBottomToolbarSections } from "./ElementBottomToolbarContext"
import { useElementVersionToolbarSection } from "./ElementVersionToolbarSection"
import { useIsMediaReplacing } from "../../../app/hooks/canvas"

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
	const { selectedElements, isDragging, isSelecting, subElementTooltip } = useCanvasSelectionUI()
	const { croppingElementId, extendingElementId, erasingElementId } = useCanvasModeUI()
	const { fullscreenMediaElement } = useCanvasPanelUI()
	const { t } = useCanvasDesignI18n()
	const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null
	const element = selectedElement && isVersionElement(selectedElement) ? selectedElement : null
	const isReplacing = useIsMediaReplacing(element?.id)
	useElementVersionToolbarSection(
		element?.type === ElementTypeEnum.Audio ? (element as AudioElement) : null,
		!isReplacing,
	)
	const sections = useElementBottomToolbarSections(element?.id ?? null)
	const allSections = isReplacing ? [] : sections
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
		!isReplacing &&
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
