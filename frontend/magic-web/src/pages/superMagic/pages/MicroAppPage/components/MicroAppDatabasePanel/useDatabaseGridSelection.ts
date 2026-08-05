import type { MouseEvent } from "react"
import { useCallback, useState } from "react"

import type { MagicBaseCellSelection } from "./DataGrid"
import { EMPTY_CELL_SELECTION } from "./panelState"

export default function useDatabaseGridSelection() {
	const [selectedCells, setSelectedCells] = useState<MagicBaseCellSelection>(EMPTY_CELL_SELECTION)
	const [selectionResetVersion, setSelectionResetVersion] = useState(0)

	const clearSelection = useCallback(() => {
		setSelectedCells(EMPTY_CELL_SELECTION)
		setSelectionResetVersion((version) => version + 1)
	}, [])

	const handlePanelMouseDown = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (selectedCells.rowIds.length === 0 || event.button !== 0) return
			const target = event.target as HTMLElement
			if (
				target.closest(
					"[data-magicbase-row-index][data-magicbase-column-index], button, a, input, textarea, select, [data-preserve-grid-selection]",
				)
			) {
				return
			}
			clearSelection()
		},
		[clearSelection, selectedCells.rowIds.length],
	)

	return {
		selectedCells,
		setSelectedCells,
		selectionResetVersion,
		clearSelection,
		handlePanelMouseDown,
	}
}
