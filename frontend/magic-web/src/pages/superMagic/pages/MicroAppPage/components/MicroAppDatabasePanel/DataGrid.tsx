import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
	CellCoordinate,
	ContextMenuPosition,
	DataGridProps,
	MagicBaseCellSelection,
} from "./DataGrid.types"
import DataGridView from "./DataGridView"
import {
	buildHeaderSelection,
	EMPTY_GRID_SELECTION,
	type HeaderColumnSelection,
} from "./dataGridSelection"
import { useDataGridAutoScroll } from "./useDataGridAutoScroll"
import useDataGridRowSelection from "./useDataGridRowSelection"

export type { MagicBaseCellSelection } from "./DataGrid.types"

export default function DataGrid({
	columns,
	rows,
	sort,
	loading,
	total,
	totalKnown,
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
	const [headerColumnSelection, setHeaderColumnSelection] =
		useState<HeaderColumnSelection | null>(null)
	const [contextSelection, setContextSelection] = useState<MagicBaseCellSelection | null>(null)
	const [contextMenuSelection, setContextMenuSelection] = useState<MagicBaseCellSelection | null>(
		null,
	)
	const [contextMenuPosition, setContextMenuPosition] = useState<ContextMenuPosition | null>(null)
	const rootRef = useRef<HTMLDivElement | null>(null)
	const menuRef = useRef<HTMLDivElement | null>(null)
	const headerDraggingRef = useRef(false)
	const suppressHeaderSortRef = useRef(false)
	const currentSelectionRef = useRef<MagicBaseCellSelection>({
		rowIds: [],
		columnIds: [],
		columnKeys: [],
	})
	const contextSelectionRef = useRef<MagicBaseCellSelection | null>(null)
	const {
		rowSelection,
		draggingRef,
		pointerRef,
		isRowSelected,
		handleCellMouseDown: updateRowSelectionOnMouseDown,
		handleCellMouseEnter,
		selectRowForContextMenu,
		updateSelectionFromPoint,
		advanceSelectionColumn,
		clearRows,
		stopDragging,
	} = useDataGridRowSelection({ rows, columns })

	const buildHeaderColumnSelection = useCallback(
		(selection: HeaderColumnSelection | null) => buildHeaderSelection(columns, selection),
		[columns],
	)

	const currentSelection = useMemo<MagicBaseCellSelection>(() => {
		if (headerColumnSelection) {
			return buildHeaderColumnSelection(headerColumnSelection)
		}
		return rowSelection
	}, [buildHeaderColumnSelection, headerColumnSelection, rowSelection])

	useEffect(() => {
		currentSelectionRef.current = currentSelection
		onSelectionChange?.(currentSelection)
	}, [currentSelection, onSelectionChange])

	useEffect(() => {
		contextSelectionRef.current = contextSelection
	}, [contextSelection])

	const { cancelAutoScroll, handleGridMouseMove, scheduleAutoScroll } = useDataGridAutoScroll({
		rootRef,
		draggingRef,
		pointerRef,
		updateSelectionFromPoint,
		advanceSelectionColumn,
	})

	useEffect(() => {
		clearRows()
		setHeaderColumnSelection(null)
		currentSelectionRef.current = EMPTY_GRID_SELECTION
		setContextSelection(null)
		setContextMenuSelection(null)
		setContextMenuPosition(null)
		contextSelectionRef.current = null
		headerDraggingRef.current = false
		cancelAutoScroll()
	}, [cancelAutoScroll, clearRows, columns, rows, selectionResetKey])

	const isHeaderSelected = (columnIndex: number) => {
		if (!headerColumnSelection) return false
		return (
			columnIndex >=
				Math.min(headerColumnSelection.startIndex, headerColumnSelection.endIndex) &&
			columnIndex <=
				Math.max(headerColumnSelection.startIndex, headerColumnSelection.endIndex)
		)
	}

	const handleCellMouseDown = (cell: CellCoordinate, event: MouseEvent) => {
		updateRowSelectionOnMouseDown(cell, event)
		setContextSelection(null)
		setContextMenuSelection(null)
		setHeaderColumnSelection(null)
	}

	const handleHeaderMouseDown = (columnIndex: number, event: MouseEvent) => {
		if (rows.length > 0 || event.button !== 0) return
		event.preventDefault()
		headerDraggingRef.current = true
		suppressHeaderSortRef.current = true
		clearRows()
		setHeaderColumnSelection({ startIndex: columnIndex, endIndex: columnIndex })
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
			clearRows()
			setHeaderColumnSelection(nextHeaderSelection)
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

	const handleCellMouseUp = () => {
		stopDragging()
		cancelAutoScroll()
	}

	const handleCellContextMenu = (cell: CellCoordinate, event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()

		const nextSelection = selectRowForContextMenu(cell)
		setHeaderColumnSelection(null)
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
		clearRows()
		setHeaderColumnSelection(null)
		setContextSelection(null)
		setContextMenuSelection(null)
		setContextMenuPosition(null)
		contextSelectionRef.current = null
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

		const stopWindowDragging = () => {
			stopDragging()
			headerDraggingRef.current = false
			cancelAutoScroll()
		}

		window.addEventListener("mousedown", handlePointerDown)
		window.addEventListener("scroll", closeContextMenu, true)
		window.addEventListener("resize", closeContextMenu)
		window.addEventListener("keydown", handleKeyDown)
		window.addEventListener("mousemove", updateWindowPointer)
		window.addEventListener("mouseup", stopWindowDragging)
		return () => {
			window.removeEventListener("mousedown", handlePointerDown)
			window.removeEventListener("scroll", closeContextMenu, true)
			window.removeEventListener("resize", closeContextMenu)
			window.removeEventListener("keydown", handleKeyDown)
			window.removeEventListener("mousemove", updateWindowPointer)
			window.removeEventListener("mouseup", stopWindowDragging)
			cancelAutoScroll()
		}
	}, [
		cancelAutoScroll,
		closeContextMenu,
		contextMenuPosition,
		draggingRef,
		pointerRef,
		scheduleAutoScroll,
		stopDragging,
	])

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
			totalKnown={totalKnown}
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
			isRowSelected={isRowSelected}
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
