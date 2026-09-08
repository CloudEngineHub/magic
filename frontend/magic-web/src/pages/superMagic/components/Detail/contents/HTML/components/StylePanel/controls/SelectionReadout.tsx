import { useTranslation } from "react-i18next"
import { getDomTreeSemanticLabel, getSemanticKey } from "../../DOMTreePanel/domTreeModel"
import type { SelectedElementInfo } from "../types"
import { formatUsedSizeLabel } from "../utils/dimensionValue"

interface SelectionReadoutProps {
	selectedElement: SelectedElementInfo | null
}

export function SelectionReadout({ selectedElement }: SelectionReadoutProps) {
	const { t } = useTranslation("super")
	const emptyLabel = t("stylePanel.selectionReadoutEmpty")

	if (!selectedElement) {
		return (
			<div
				data-testid="html-editor-selection-readout"
				aria-label={emptyLabel}
				className="ml-2 flex shrink-0 items-center text-[11px] leading-none text-muted-foreground"
			>
				<span className="shrink-0">{emptyLabel}</span>
			</div>
		)
	}

	const label = getDomTreeSemanticLabel(t, getSemanticKey(selectedElement.tagName))
	const width = formatUsedSizeLabel(selectedElement.computedStyles?.width)
	const height = formatUsedSizeLabel(selectedElement.computedStyles?.height)

	return (
		<div
			data-testid="html-editor-selection-readout"
			aria-label={t("stylePanel.selectionReadout", { tag: label, width, height })}
			className="ml-2 flex shrink-0 items-center gap-2 text-[11px] leading-none text-muted-foreground"
		>
			<span className="shrink-0 font-medium text-foreground">{label}</span>
			<span className="h-3 w-px shrink-0 bg-border" aria-hidden />
			<span className="min-w-0 truncate tabular-nums">
				{width} × {height}
			</span>
		</div>
	)
}
