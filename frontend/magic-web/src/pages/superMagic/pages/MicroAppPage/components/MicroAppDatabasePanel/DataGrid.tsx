import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MagicBaseRow, MagicBaseSortRule } from "@/apis/modules/magicBase"
import type { CellCoordinate, ContextMenuPosition, MagicBaseCellSelection } from "./DataGrid.types"
import DataGridView from "./DataGridView"
import {
	buildHeaderSelection,
	buildSelectionFromBounds as buildSelectionFromBoundsValue,
	buildSingleCellSelection as buildSingleCellSelectionValue,
	EMPTY_GRID_SELECTION,
	type HeaderColumnSelection,
	isCellWithinSelection,
} from "./dataGridSelection"
import type { MagicBaseGridColumn } from "./utils"
import { useDataGridAutoScroll } from "./useDataGridAutoScroll"

export type { MagicBaseCellSelection } from "./DataGrid.types"

interface DataGridProps {
	columns: MagicBaseGridColumn[]
	rows: MagicBaseRow[]
	sort: MagicBaseSortRule | null
	loading: boolean
	total: number
	loadedRowCount: number
	hasMore: boolean
	loadingMore: boolean
	selectionResetKey?: string
	onSortChange: (field: string) => void
	onLoadMore: () => void
	onSelectionChange?: (selection: MagicBaseCellSelection) => void
	onOpenEditRow?: (rowId: string) => void
	onDeleteRows?: (selection: MagicBaseCellSelection) => void
	canManagePermissions?: boolean
	onOpenRowPermissions?: (selection: MagicBaseCellSelection) => void
	onOpenColumnPermissions?: (selection: MagicBaseCellSelection) => void
}

export default function DataGrid({
	columns,
	rows,
	sort,
	loading,
	total,
	loadedRowCount,
	hasMore,
	loadingMore,
	selectionResetKey,
	onSortChange,
	onLoadMore,
	onSelectionChange,
	onOpenEditRow,
	onDeleteRows,
	canManagePermissions = true,
	onOpenRowPermissions,
	onOpenColumnPermissions,
}: DataGridProps) {
	const [selectionStart, setSelectionStart] = useState<CellCoordinate | null>(null)
	const [selectionEnd, setSelectionEnd] = useState<CellCoordinate | null>(null)
	const [headerColumnSelection, setHeaderColumnSelection] =
		useState<HeaderColumnSelection | null>(null)
	const [contextSelection, setContextSelection] = useState<MagicBaseCellSelection | null>(null)
	const [contextMenuSelection, setContextMenuSelection] = useState<MagicBaseCellSelection | null>(
		null,
	)
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null)
	const rootRef = useRef<HTMLDivElement | null>(null)
	const menuRef = useRef<HTMLDivElement | null>(null)
	const draggingRef = useRef(false)
	const headerDraggingRef = useRef(false)
	const suppressHeaderSortRef = useRef(false)
	const selectionStartRef = useRef<CellCoordinate | null>(null)
	const selectionEndRef = useRef<CellCoordinate | null>(null)
	const currentSelectionRef = useRef<MagicBaseCellSelection>({
		rowIds: [],
		columnIds: [],
		columnKeys: [],
	})
	const contextSelectionRef = useRef<MagicBaseCellSelection | null>(null)
	const pointerRef = useRef<{ x: number; y: number } | null>(null)

	const selectionBounds = useMemo(() => {
		if (!selectionStart || !selectionEnd) return null
		return {
			minRow: Math.min(selectionStart.rowIndex, selectionEnd.rowIndex),
			maxRow: Math.max(selectionStart.rowIndex, selectionEnd.rowIndex),
			minColumn: Math.min(selectionStart.columnIndex, selectionEnd.columnIndex),
			maxColumn: Math.max(selectionStart.columnIndex, selectionEnd.columnIndex),
		}
	}, [selectionEnd, selectionStart])

	const buildSelectionFromBounds = useCallback(
		(bounds: Parameters<typeof buildSelectionFromBoundsValue>[2]) =>
			buildSelectionFromBoundsValue(rows, columns, bounds),
		[columns, rows],
	)

	const buildSelectionFromCoordinates = useCallback(
		(start: CellCoordinate | null, end: CellCoordinate | null): MagicBaseCellSelection => {
			if (!start || !end) return EMPTY_GRID_SELECTION
			return buildSelectionFromBounds({
				minRow: Math.min(start.rowIndex, end.rowIndex),
				maxRow: Math.max(start.rowIndex, end.rowIndex),
				minColumn: Math.min(start.columnIndex, end.columnIndex),
				maxColumn: Math.max(start.columnIndex, end.columnIndex),
			})
		},
		[buildSelectionFromBounds],
	)

	const buildHeaderColumnSelection = useCallback(
		(selection: HeaderColumnSelection | null) => buildHeaderSelection(columns, selection),
		[columns],
	)

	const currentSelection = useMemo<MagicBaseCellSelection>(() => {
		if (headerColumnSelection) {
			return buildHeaderColumnSelection(headerColumnSelection)
		}
		return buildSelectionFromBounds(selectionBounds)
	}, [
		buildHeaderColumnSelection,
		buildSelectionFromBounds,
		headerColumnSelection,
		selectionBounds,
	])

	const isCellInRefSelection = (cell: CellCoordinate) => {
		return isCellWithinSelection(cell, selectionStartRef.current, selectionEndRef.current)
	}

	const syncLiveSelection = useCallback(() => {
		const selection = buildSelectionFromCoordinates(
			selectionStartRef.current,
			selectionEndRef.current,
		)
		currentSelectionRef.current = selection
		return selection
	}, [buildSelectionFromCoordinates])

	useEffect(() => {
		currentSelectionRef.current = currentSelection
		onSelectionChange?.(currentSelection)
	}, [currentSelection, onSelectionChange])

	useEffect(() => {
		contextSelectionRef.current = contextSelection
	}, [contextSelection])

	const updateSelectionEnd = useCallback(
		(cell: CellCoordinate) => {
			selectionEndRef.current = cell
			currentSelectionRef.current = buildSelectionFromCoordinates(
				selectionStartRef.current,
				cell,
			)
			setSelectionEnd(cell)
		},
		[buildSelectionFromCoordinates],
	)

	const advanceSelectionColumn = useCallback(
		(direction: 1 | -1) => {
			const end = selectionEndRef.current
			if (!end) return
			const nextColumnIndex = Math.max(
				0,
				Math.min(columns.length - 1, end.columnIndex + direction),
			)
			if (nextColumnIndex === end.columnIndex) return
			updateSelectionEnd({ ...end, columnIndex: nextColumnIndex })
		},
		[columns.length, updateSelectionEnd],
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
			updateSelectionEnd({ rowIndex, columnIndex })
			return true
		},
		[updateSelectionEnd],
	)

	const { cancelAutoScroll, handleGridMouseMove, scheduleAutoScroll } = useDataGridAutoScroll({
		rootRef,
		draggingRef,
		pointerRef,
		updateSelectionFromPoint,
		advanceSelectionColumn,
	})

	useEffect(() => {
		setSelectionStart(null)
		setSelectionEnd(null)
		setHeaderColumnSelection(null)
		selectionStartRef.current = null
		selectionEndRef.current = null
		currentSelectionRef.current = EMPTY_GRID_SELECTION
		setContextSelection(null)
		setContextMenuSelection(null)
		setContextMenuPosition(null)
		contextSelectionRef.current = null
		draggingRef.current = false
		headerDraggingRef.current = false
		pointerRef.current = null
		cancelAutoScroll()
		onSelectionChange?.(EMPTY_GRID_SELECTION)
	}, [cancelAutoScroll, columns, onSelectionChange, rows, selectionResetKey])

	const buildSingleCellSelection = (cell: CellCoordinate) =>
		buildSingleCellSelectionValue(rows, columns, cell)

	const isCellSelected = (rowIndex: number, columnIndex: number) => {
		if (!selectionBounds) return false
		return (
			rowIndex >= selectionBounds.minRow &&
			rowIndex <= selectionBounds.maxRow &&
			columnIndex >= selectionBounds.minColumn &&
			columnIndex <= selectionBounds.maxColumn
		)
	}

	const isHeaderSelected = (columnIndex: number) => {
		if (!headerColumnSelection) return false
		return (
			columnIndex >=
				Math.min(headerColumnSelection.startIndex, headerColumnSelection.endIndex) &&
			columnIndex <=
				Math.max(headerColumnSelection.startIndex, headerColumnSelection.endIndex)
		)
	}

	const selectSingleCell = (cell: CellCoordinate) => {
		selectionStartRef.current = cell
		selectionEndRef.current = cell
		setSelectionStart(cell)
		setSelectionEnd(cell)
	}

	const handleCellMouseDown = (cell: CellCoordinate, event: MouseEvent) => {
		if (event.button !== 0) return
		event.preventDefault()
		pointerRef.current = { x: event.clientX, y: event.clientY }
		draggingRef.current = true
		selectionStartRef.current = cell
		selectionEndRef.current = cell
		currentSelectionRef.current = buildSingleCellSelection(cell)
		setContextSelection(null)
		setContextMenuSelection(null)
		setSelectionStart(cell)
		setSelectionEnd(cell)
		setHeaderColumnSelection(null)
	}

	const handleHeaderMouseDown = (columnIndex: number, event: MouseEvent) => {
		if (rows.length > 0 || event.button !== 0) return
		event.preventDefault()
		headerDraggingRef.current = true
		suppressHeaderSortRef.current = true
		setHeaderColumnSelection({ startIndex: columnIndex, endIndex: columnIndex })
		setSelectionStart(null)
		setSelectionEnd(null)
	}

	const handleHeaderMouseEnter = (columnIndex: number) => {
		if (!headerDraggingRef.current) return
		setHeaderColumnSelection((current) =>
			current ? { ...current, endIndex: columnIndex } : current,
		)
	}

	const handleHeaderMouseUp = () => {
		headerDraggingRef.current = false
	}

	const handleHeaderContextMenu = (columnIndex: number, event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()

		const isWithinCurrentSelection =
			headerColumnSelection !== null &&
			columnIndex >=
				Math.min(headerColumnSelection.startIndex, headerColumnSelection.endIndex) &&
			columnIndex <=
				Math.max(headerColumnSelection.startIndex, headerColumnSelection.endIndex)
		const nextHeaderSelection = isWithinCurrentSelection
			? headerColumnSelection
			: { startIndex: columnIndex, endIndex: columnIndex }
		const nextSelection = buildHeaderColumnSelection(nextHeaderSelection)

		if (!isWithinCurrentSelection) {
			setHeaderColumnSelection(nextHeaderSelection)
			setSelectionStart(null)
			setSelectionEnd(null)
		}
		currentSelectionRef.current = nextSelection
		contextSelectionRef.current = nextSelection
		setContextSelection(nextSelection)
		setContextMenuSelection(nextSelection)
		setContextMenuPosition({
			x: Math.min(event.clientX, window.innerWidth - 190),
			y: Math.min(event.clientY, window.innerHeight - 132),
		})
	}

	const handleCellMouseEnter = (cell: CellCoordinate) => {
		if (!draggingRef.current) return
		updateSelectionEnd(cell)
	}

	const handleCellMouseUp = () => {
		draggingRef.current = false
		pointerRef.current = null
		cancelAutoScroll()
	}

	const handleCellContextMenu = (cell: CellCoordinate, event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()
		const selectedByLiveRange = isCellInRefSelection(cell)
		const nextSelection = !selectedByLiveRange
			? buildSingleCellSelection(cell)
			: syncLiveSelection()

		if (!selectedByLiveRange) {
			selectSingleCell(cell)
		}
		currentSelectionRef.current = nextSelection
		contextSelectionRef.current = nextSelection
		setContextSelection(nextSelection)
		setContextMenuSelection(nextSelection)

		setContextMenuPosition({
			x: Math.min(event.clientX, window.innerWidth - 190),
			y: Math.min(event.clientY, window.innerHeight - 132),
		})
	}

	const clearSelection = () => {
		setSelectionStart(null)
		setSelectionEnd(null)
		setHeaderColumnSelection(null)
		selectionStartRef.current = null
		selectionEndRef.current = null
		setContextSelection(null)
		setContextMenuSelection(null)
		setContextMenuPosition(null)
		contextSelectionRef.current = null
		draggingRef.current = false
		pointerRef.current = null
		cancelAutoScroll()
	}

	const getContextMenuSelection = () =>
		contextSelectionRef.current ?? contextSelection ?? currentSelectionRef.current

	const hasConfigurableColumns = (selection: MagicBaseCellSelection) => {
		const selectedColumnKeys = new Set(selection.columnKeys)
		return columns.some(
			(column) =>
				column.source === "schema" && column.id && selectedColumnKeys.has(column.key),
		)
	}

	const closeContextMenu = useCallback(() => {
		setContextMenuPosition(null)
	}, [])

	const handleOpenRowPermissions = () => {
		const selection = getContextMenuSelection()
		if (selection.rowIds.length === 0) return
		closeContextMenu()
		onOpenRowPermissions?.(selection)
	}

	const handleOpenColumnPermissions = () => {
		const selection = getContextMenuSelection()
		if (!hasConfigurableColumns(selection)) return
		closeContextMenu()
		onOpenColumnPermissions?.(selection)
	}

	const handleOpenEditRow = () => {
		const selection = getContextMenuSelection()
		if (selection.rowIds.length !== 1) return
		closeContextMenu()
		onOpenEditRow?.(selection.rowIds[0])
	}

	const handleDeleteRows = () => {
		const selection = getContextMenuSelection()
		if (selection.rowIds.length === 0) return
		closeContextMenu()
		onDeleteRows?.(selection)
	}

	useEffect(() => {
		const handlePointerDown = (event: globalThis.MouseEvent) => {
			if (!contextMenuPosition) return
			if (menuRef.current?.contains(event.target as Node)) return
			closeContextMenu()
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeContextMenu()
		}

		const updateWindowPointer = (event: globalThis.MouseEvent) => {
			if (!draggingRef.current) return
			pointerRef.current = { x: event.clientX, y: event.clientY }
			scheduleAutoScroll()
		}

		const stopDragging = () => {
			draggingRef.current = false
			headerDraggingRef.current = false
			pointerRef.current = null
			cancelAutoScroll()
		}

		window.addEventListener("mousedown", handlePointerDown)
		window.addEventListener("scroll", closeContextMenu, true)
		window.addEventListener("resize", closeContextMenu)
		window.addEventListener("keydown", handleKeyDown)
		window.addEventListener("mousemove", updateWindowPointer)
		window.addEventListener("mouseup", stopDragging)
		return () => {
			window.removeEventListener("mousedown", handlePointerDown)
			window.removeEventListener("scroll", closeContextMenu, true)
			window.removeEventListener("resize", closeContextMenu)
			window.removeEventListener("keydown", handleKeyDown)
			window.removeEventListener("mousemove", updateWindowPointer)
			window.removeEventListener("mouseup", stopDragging)
			cancelAutoScroll()
		}
	}, [cancelAutoScroll, closeContextMenu, contextMenuPosition, scheduleAutoScroll])

	if (loading) {
		return (
			<div className="space-y-2 p-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
				))}
			</div>
		)
	}

	const activeSelection = contextMenuSelection ?? contextSelection ?? currentSelection
	const hasSelectedConfigurableColumns = hasConfigurableColumns(activeSelection)
	const canEditSelectedRow = activeSelection.rowIds.length === 1

	return (
		<DataGridView
			rootRef={rootRef}
			menuRef={menuRef}
			columns={columns}
			rows={rows}
			sort={sort}
			total={total}
			loadedRowCount={loadedRowCount}
			hasMore={hasMore}
			loadingMore={loadingMore}
			contextMenuPosition={contextMenuPosition}
			activeSelection={activeSelection}
			canEditSelectedRow={canEditSelectedRow}
			canManagePermissions={canManagePermissions}
			hasSelectedConfigurableColumns={hasSelectedConfigurableColumns}
			suppressHeaderSortRef={suppressHeaderSortRef}
			onSortChange={onSortChange}
			onLoadMore={onLoadMore}
			onOpenEditRow={onOpenEditRow}
			isHeaderSelected={isHeaderSelected}
			isCellSelected={isCellSelected}
			onHeaderMouseDown={handleHeaderMouseDown}
			onHeaderMouseEnter={handleHeaderMouseEnter}
			onHeaderMouseUp={handleHeaderMouseUp}
			onHeaderContextMenu={handleHeaderContextMenu}
			onCellMouseDown={handleCellMouseDown}
			onCellMouseEnter={handleCellMouseEnter}
			onCellMouseUp={handleCellMouseUp}
			onCellContextMenu={handleCellContextMenu}
			onGridMouseMove={handleGridMouseMove}
			onGridMouseLeave={scheduleAutoScroll}
			onContextMenuEdit={handleOpenEditRow}
			onContextMenuDelete={handleDeleteRows}
			onContextMenuRowPermission={handleOpenRowPermissions}
			onContextMenuColumnPermission={handleOpenColumnPermissions}
			onClearSelection={clearSelection}
		/>
	)
}
