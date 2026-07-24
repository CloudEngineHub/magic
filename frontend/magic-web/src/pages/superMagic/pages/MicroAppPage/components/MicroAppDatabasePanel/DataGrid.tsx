import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import type { MouseEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { MagicBaseRow, MagicBaseSortRule } from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import type { MagicBaseGridColumn } from "./utils"
import { formatCellValue } from "./utils"

export interface MagicBaseCellSelection {
	rowIds: string[]
	columnIds: string[]
	columnKeys: string[]
}

interface DataGridProps {
	columns: MagicBaseGridColumn[]
	rows: MagicBaseRow[]
	sort: MagicBaseSortRule | null
	loading: boolean
	selectionResetKey?: string
	onSortChange: (field: string) => void
	onSelectionChange?: (selection: MagicBaseCellSelection) => void
	onOpenEditRow?: (rowId: string) => void
	onDeleteRows?: (selection: MagicBaseCellSelection) => void
	canManagePermissions?: boolean
	onOpenRowPermissions?: (selection: MagicBaseCellSelection) => void
	onOpenColumnPermissions?: (selection: MagicBaseCellSelection) => void
}

type CellCoordinate = {
	rowIndex: number
	columnIndex: number
}

type ContextMenuPosition = {
	x: number
	y: number
}

type HeaderColumnSelection = {
	startIndex: number
	endIndex: number
}

function SortIcon({ columnKey, sort }: { columnKey: string; sort: MagicBaseSortRule | null }) {
	if (sort?.field !== columnKey) {
		return <ChevronsUpDown className="size-3.5 text-muted-foreground" />
	}
	return sort.order === "asc" ? (
		<ArrowUp className="size-3.5 text-foreground" />
	) : (
		<ArrowDown className="size-3.5 text-foreground" />
	)
}

function getRowRecordId(row: MagicBaseRow): string {
	return String(row.id ?? row.record_id ?? "")
}

export default function DataGrid({
	columns,
	rows,
	sort,
	loading,
	selectionResetKey,
	onSortChange,
	onSelectionChange,
	onOpenEditRow,
	onDeleteRows,
	canManagePermissions = true,
	onOpenRowPermissions,
	onOpenColumnPermissions,
}: DataGridProps) {
	const { t } = useTranslation("super")
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
	const autoScrollFrameRef = useRef<number | null>(null)

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
		(
			bounds: {
				minRow: number
				maxRow: number
				minColumn: number
				maxColumn: number
			} | null,
		): MagicBaseCellSelection => {
			if (!bounds) {
				return { rowIds: [], columnIds: [], columnKeys: [] }
			}

			const rowIds = rows
				.slice(bounds.minRow, bounds.maxRow + 1)
				.map(getRowRecordId)
				.filter(Boolean)
			const selectedColumns = columns.slice(bounds.minColumn, bounds.maxColumn + 1)
			return {
				rowIds: [...new Set(rowIds)],
				columnIds: [
					...new Set(
						selectedColumns
							.filter((column) => column.source === "schema" && column.id)
							.map((column) => column.id as string),
					),
				],
				columnKeys: [...new Set(selectedColumns.map((column) => column.key))],
			}
		},
		[columns, rows],
	)

	const buildSelectionFromCoordinates = useCallback(
		(start: CellCoordinate | null, end: CellCoordinate | null): MagicBaseCellSelection => {
			if (!start || !end) {
				return { rowIds: [], columnIds: [], columnKeys: [] }
			}
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
		(selection: HeaderColumnSelection | null): MagicBaseCellSelection => {
			if (!selection) return { rowIds: [], columnIds: [], columnKeys: [] }

			const selectedColumns = columns.slice(
				Math.min(selection.startIndex, selection.endIndex),
				Math.max(selection.startIndex, selection.endIndex) + 1,
			)
			return {
				rowIds: [],
				columnIds: [
					...new Set(
						selectedColumns
							.filter((column) => column.source === "schema" && column.id)
							.map((column) => column.id as string),
					),
				],
				columnKeys: [...new Set(selectedColumns.map((column) => column.key))],
			}
		},
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
		const start = selectionStartRef.current
		const end = selectionEndRef.current
		if (!start || !end) return false
		const minRow = Math.min(start.rowIndex, end.rowIndex)
		const maxRow = Math.max(start.rowIndex, end.rowIndex)
		const minColumn = Math.min(start.columnIndex, end.columnIndex)
		const maxColumn = Math.max(start.columnIndex, end.columnIndex)
		return (
			cell.rowIndex >= minRow &&
			cell.rowIndex <= maxRow &&
			cell.columnIndex >= minColumn &&
			cell.columnIndex <= maxColumn
		)
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

	const getScrollContainer = useCallback(() => {
		return rootRef.current
	}, [])

	const cancelAutoScroll = useCallback(() => {
		if (autoScrollFrameRef.current !== null) {
			window.cancelAnimationFrame(autoScrollFrameRef.current)
			autoScrollFrameRef.current = null
		}
	}, [])

	useEffect(() => {
		setSelectionStart(null)
		setSelectionEnd(null)
		setHeaderColumnSelection(null)
		selectionStartRef.current = null
		selectionEndRef.current = null
		currentSelectionRef.current = { rowIds: [], columnIds: [], columnKeys: [] }
		setContextSelection(null)
		setContextMenuSelection(null)
		setContextMenuPosition(null)
		contextSelectionRef.current = null
		draggingRef.current = false
		headerDraggingRef.current = false
		pointerRef.current = null
		cancelAutoScroll()
		onSelectionChange?.({ rowIds: [], columnIds: [], columnKeys: [] })
	}, [cancelAutoScroll, columns, onSelectionChange, rows, selectionResetKey])

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

	const runAutoScroll = useCallback(() => {
		autoScrollFrameRef.current = null
		if (!draggingRef.current || !pointerRef.current) return

		const container = getScrollContainer()
		if (!container) return

		const rect = container.getBoundingClientRect()
		const edgeSize = 56
		const maxStep = 28
		const { x, y } = pointerRef.current
		let scrollStep = 0

		if (x > rect.right - edgeSize) {
			scrollStep = Math.min(maxStep, Math.ceil(x - (rect.right - edgeSize)))
		} else if (x < rect.left + edgeSize) {
			scrollStep = -Math.min(maxStep, Math.ceil(rect.left + edgeSize - x))
		}

		if (scrollStep !== 0) {
			container.scrollLeft += scrollStep
			const updated = updateSelectionFromPoint(x, y, container)
			if (!updated) {
				advanceSelectionColumn(scrollStep > 0 ? 1 : -1)
			}
			autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
		}
	}, [advanceSelectionColumn, getScrollContainer, updateSelectionFromPoint])

	const scheduleAutoScroll = useCallback(() => {
		if (autoScrollFrameRef.current !== null) return
		autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
	}, [runAutoScroll])

	const buildSingleCellSelection = (cell: CellCoordinate): MagicBaseCellSelection => {
		const row = rows[cell.rowIndex]
		const column = columns[cell.columnIndex]
		const rowId = row ? getRowRecordId(row) : ""
		return {
			rowIds: rowId ? [rowId] : [],
			columnIds: column?.source === "schema" && column.id ? [column.id] : [],
			columnKeys: column ? [column.key] : [],
		}
	}

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

	const handleGridMouseMove = (event: MouseEvent<HTMLDivElement>) => {
		if (!draggingRef.current) return
		pointerRef.current = { x: event.clientX, y: event.clientY }
		scheduleAutoScroll()
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
		<div
			ref={rootRef}
			className="h-full min-w-0 overflow-auto"
			onMouseMove={handleGridMouseMove}
			onMouseLeave={scheduleAutoScroll}
		>
			<table className="w-full min-w-max caption-bottom border-separate border-spacing-0 text-sm">
				<thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
					<tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
						{columns.map((column, columnIndex) => (
							<th
								key={column.key}
								data-magicbase-header-column-index={columnIndex}
								className={cn(
									"h-12 min-w-[180px] whitespace-nowrap border-b border-r border-border bg-background p-0 text-left align-middle font-medium text-foreground",
									isHeaderSelected(columnIndex) &&
										"bg-primary/10 ring-1 ring-inset ring-primary/30",
								)}
								onMouseDown={(event) => handleHeaderMouseDown(columnIndex, event)}
								onMouseEnter={() => handleHeaderMouseEnter(columnIndex)}
								onMouseUp={handleHeaderMouseUp}
								onContextMenu={(event) =>
									handleHeaderContextMenu(columnIndex, event)
								}
							>
								<Button
									type="button"
									variant="ghost"
									className="h-full w-full justify-between rounded-none px-3 py-2 text-left"
									onClick={() => {
										if (suppressHeaderSortRef.current) {
											suppressHeaderSortRef.current = false
											return
										}
										onSortChange(column.key)
									}}
								>
									<span className="min-w-0">
										<span className="block truncate text-xs font-medium text-foreground">
											{column.name}
										</span>
										<span className="block truncate text-[11px] font-normal text-muted-foreground">
											{column.type || "-"}
										</span>
									</span>
									<SortIcon columnKey={column.key} sort={sort} />
								</Button>
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&_tr:last-child]:border-0">
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={Math.max(columns.length, 1)}
								className="h-48 text-center text-sm text-muted-foreground"
							>
								{t("microAppPage.databasePanel.noRows")}
							</td>
						</tr>
					) : (
						rows.map((row, rowIndex) => {
							const recordId = getRowRecordId(row)
							return (
								<tr
									key={recordId || rowIndex}
									className="border-b transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted"
								>
									{columns.map((column, columnIndex) => {
										const value = row[column.key]
										const selected = isCellSelected(rowIndex, columnIndex)
										return (
											<td
												key={column.key}
												data-testid="magicbase-data-cell"
												data-magicbase-row-index={rowIndex}
												data-magicbase-column-index={columnIndex}
												className={cn(
													"max-w-[280px] select-none border-b border-r border-border px-3 py-2 text-xs",
													value == null && "text-muted-foreground",
													selected &&
														"bg-primary/10 ring-1 ring-inset ring-primary/30",
												)}
												title={formatCellValue(value)}
												onMouseDown={(event) =>
													handleCellMouseDown(
														{ rowIndex, columnIndex },
														event,
													)
												}
												onMouseEnter={() =>
													handleCellMouseEnter({
														rowIndex,
														columnIndex,
													})
												}
												onMouseUp={handleCellMouseUp}
												onContextMenu={(event) =>
													handleCellContextMenu(
														{
															rowIndex,
															columnIndex,
														},
														event,
													)
												}
												onDoubleClick={() => {
													if (column.source !== "schema") return
													if (!recordId) return
													onOpenEditRow?.(recordId)
												}}
											>
												<span className="block truncate">
													{formatCellValue(value)}
												</span>
											</td>
										)
									})}
								</tr>
							)
						})
					)}
				</tbody>
			</table>
			{contextMenuPosition ? (
				<div
					ref={menuRef}
					role="menu"
					className="fixed z-[1201] min-w-40 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
					style={{ left: contextMenuPosition.x, top: contextMenuPosition.y }}
					onContextMenu={(event) => event.preventDefault()}
					onMouseDown={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						role="menuitem"
						disabled={!canEditSelectedRow}
						className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
						onClick={handleOpenEditRow}
					>
						{t("microAppPage.databasePanel.contextMenu.editRow")}
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={activeSelection.rowIds.length === 0}
						className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
						onClick={handleDeleteRows}
					>
						{t("microAppPage.databasePanel.contextMenu.deleteRows")}
					</button>
					{canManagePermissions ? (
						<>
							<div className="-mx-1 my-1 h-px bg-border" />
							<button
								type="button"
								role="menuitem"
								disabled={activeSelection.rowIds.length === 0}
								className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
								onClick={handleOpenRowPermissions}
							>
								{t("microAppPage.databasePanel.contextMenu.rowPermission")}
							</button>
							<button
								type="button"
								role="menuitem"
								disabled={!hasSelectedConfigurableColumns}
								className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
								onClick={handleOpenColumnPermissions}
							>
								{t("microAppPage.databasePanel.contextMenu.columnPermission")}
							</button>
						</>
					) : null}
					<div className="-mx-1 my-1 h-px bg-border" />
					<button
						type="button"
						role="menuitem"
						className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
						onClick={clearSelection}
					>
						{t("microAppPage.databasePanel.contextMenu.clearSelection")}
					</button>
				</div>
			) : null}
		</div>
	)
}
