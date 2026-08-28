import type { MouseEvent, MutableRefObject } from "react"
import { useCallback, useMemo, useRef, useState } from "react"

import type { MagicBaseRow } from "@/apis/modules/magicBase"

import type { CellCoordinate, MagicBaseCellSelection } from "./DataGrid.types"
import {
	buildRowSelectionFromIndexes,
	getRowIndexRange,
	mergeRowIndexes,
	toggleRowIndex,
} from "./dataGridSelection"
import type { MagicBaseGridColumn } from "./utils"

interface UseDataGridRowSelectionOptions {
	rows: MagicBaseRow[]
	columns: MagicBaseGridColumn[]
}

interface DataGridRowSelection {
	rowSelection: MagicBaseCellSelection
	draggingRef: MutableRefObject<boolean>
	pointerRef: MutableRefObject<{ x: number; y: number } | null>
	isRowSelected: (rowIndex: number) => boolean
	handleCellMouseDown: (cell: CellCoordinate, event: MouseEvent) => void
	handleCellMouseEnter: (cell: CellCoordinate) => void
	selectRowForContextMenu: (cell: CellCoordinate) => MagicBaseCellSelection
	updateSelectionFromPoint: (x: number, y: number, container?: HTMLElement | null) => boolean
	advanceSelectionColumn: (direction: 1 | -1) => void
	clearRows: () => void
	stopDragging: () => void
}

export default function useDataGridRowSelection({
	rows,
	columns,
}: UseDataGridRowSelectionOptions): DataGridRowSelection {
	const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([])
	const selectedRowIndexesRef = useRef<number[]>([])
	const selectionAnchorRowRef = useRef<number | null>(null)
	const dragStartRef = useRef<CellCoordinate | null>(null)
	const dragEndRef = useRef<CellCoordinate | null>(null)
	const draggingRef = useRef(false)
	const pointerRef = useRef<{ x: number; y: number } | null>(null)

	const selectRows = useCallback(
		(rowIndexes: number[]) => {
			const nextRowIndexes = mergeRowIndexes(
				rowIndexes.filter((rowIndex) => rowIndex >= 0 && rowIndex < rows.length),
			)
			selectedRowIndexesRef.current = nextRowIndexes
			setSelectedRowIndexes(nextRowIndexes)
		},
		[rows.length],
	)

	const rowSelection = useMemo(
		() => buildRowSelectionFromIndexes(rows, columns, selectedRowIndexes),
		[columns, rows, selectedRowIndexes],
	)

	const updateDragEnd = useCallback(
		(cell: CellCoordinate) => {
			dragEndRef.current = cell
			const start = dragStartRef.current
			if (!start) return
			selectRows(getRowIndexRange(start.rowIndex, cell.rowIndex))
		},
		[selectRows],
	)

	const handleCellMouseDown = useCallback(
		(cell: CellCoordinate, event: MouseEvent) => {
			if (event.button !== 0) return
			event.preventDefault()

			const additive = event.metaKey || event.ctrlKey
			const anchorRowIndex = selectionAnchorRowRef.current ?? cell.rowIndex
			if (event.shiftKey) {
				const range = getRowIndexRange(anchorRowIndex, cell.rowIndex)
				selectRows(additive ? mergeRowIndexes(selectedRowIndexesRef.current, range) : range)
				draggingRef.current = false
				pointerRef.current = null
				return
			}

			selectionAnchorRowRef.current = cell.rowIndex
			if (additive) {
				selectRows(toggleRowIndex(selectedRowIndexesRef.current, cell.rowIndex))
				draggingRef.current = false
				pointerRef.current = null
				return
			}

			selectRows([cell.rowIndex])
			dragStartRef.current = cell
			dragEndRef.current = cell
			pointerRef.current = { x: event.clientX, y: event.clientY }
			draggingRef.current = true
		},
		[selectRows],
	)

	const handleCellMouseEnter = useCallback(
		(cell: CellCoordinate) => {
			if (!draggingRef.current) return
			updateDragEnd(cell)
		},
		[updateDragEnd],
	)

	const selectRowForContextMenu = useCallback(
		(cell: CellCoordinate) => {
			const currentIndexes = selectedRowIndexesRef.current
			if (currentIndexes.includes(cell.rowIndex)) {
				return buildRowSelectionFromIndexes(rows, columns, currentIndexes)
			}

			selectionAnchorRowRef.current = cell.rowIndex
			selectRows([cell.rowIndex])
			return buildRowSelectionFromIndexes(rows, columns, [cell.rowIndex])
		},
		[columns, rows, selectRows],
	)

	const updateSelectionFromPoint = useCallback(
		(x: number, y: number, container?: HTMLElement | null) => {
			const rect = container?.getBoundingClientRect()
			const targetX = rect ? Math.min(Math.max(x, rect.left + 4), rect.right - 4) : x
			const targetY = rect ? Math.min(Math.max(y, rect.top + 4), rect.bottom - 4) : y
			const target = document.elementFromPoint(targetX, targetY)
			const cell = target?.closest<HTMLElement>(
				"[data-magicbase-row-index][data-magicbase-column-index]",
			)
			if (!cell) return false
			const rowIndex = Number(cell.dataset.magicbaseRowIndex)
			const columnIndex = Number(cell.dataset.magicbaseColumnIndex)
			if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return false
			updateDragEnd({ rowIndex, columnIndex })
			return true
		},
		[updateDragEnd],
	)

	const advanceSelectionColumn = useCallback(
		(direction: 1 | -1) => {
			const end = dragEndRef.current
			if (!end) return
			const nextColumnIndex = Math.max(
				0,
				Math.min(columns.length - 1, end.columnIndex + direction),
			)
			if (nextColumnIndex === end.columnIndex) return
			updateDragEnd({ ...end, columnIndex: nextColumnIndex })
		},
		[columns.length, updateDragEnd],
	)

	const clearRows = useCallback(() => {
		selectRows([])
		selectionAnchorRowRef.current = null
		dragStartRef.current = null
		dragEndRef.current = null
		draggingRef.current = false
		pointerRef.current = null
	}, [selectRows])

	const stopDragging = useCallback(() => {
		draggingRef.current = false
		pointerRef.current = null
	}, [])

	return {
		rowSelection,
		draggingRef,
		pointerRef,
		isRowSelected: (rowIndex) => selectedRowIndexes.includes(rowIndex),
		handleCellMouseDown,
		handleCellMouseEnter,
		selectRowForContextMenu,
		updateSelectionFromPoint,
		advanceSelectionColumn,
		clearRows,
		stopDragging,
	}
}
