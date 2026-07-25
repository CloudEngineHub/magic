import type { MagicBaseRow } from "@/apis/modules/magicBase"

import type { CellCoordinate, MagicBaseCellSelection } from "./DataGrid.types"
import type { MagicBaseGridColumn } from "./utils"

export interface SelectionBounds {
	minRow: number
	maxRow: number
	minColumn: number
	maxColumn: number
}

export interface HeaderColumnSelection {
	startIndex: number
	endIndex: number
}

export const EMPTY_GRID_SELECTION: MagicBaseCellSelection = {
	rowIds: [],
	columnIds: [],
	columnKeys: [],
}

function getRowRecordId(row: MagicBaseRow): string {
	return String(row.id ?? row.record_id ?? "")
}

function buildColumnSelection(
	columns: MagicBaseGridColumn[],
): Pick<MagicBaseCellSelection, "columnIds" | "columnKeys"> {
	return {
		columnIds: [
			...new Set(
				columns
					.filter((column) => column.source === "schema" && column.id)
					.map((column) => column.id as string),
			),
		],
		columnKeys: [...new Set(columns.map((column) => column.key))],
	}
}

export function buildSelectionFromBounds(
	rows: MagicBaseRow[],
	columns: MagicBaseGridColumn[],
	bounds: SelectionBounds | null,
): MagicBaseCellSelection {
	if (!bounds) return EMPTY_GRID_SELECTION

	const rowIds = rows
		.slice(bounds.minRow, bounds.maxRow + 1)
		.map(getRowRecordId)
		.filter(Boolean)
	const selectedColumns = columns.slice(bounds.minColumn, bounds.maxColumn + 1)
	return {
		rowIds: [...new Set(rowIds)],
		...buildColumnSelection(selectedColumns),
	}
}

export function buildHeaderSelection(
	columns: MagicBaseGridColumn[],
	selection: HeaderColumnSelection | null,
): MagicBaseCellSelection {
	if (!selection) return EMPTY_GRID_SELECTION

	const selectedColumns = columns.slice(
		Math.min(selection.startIndex, selection.endIndex),
		Math.max(selection.startIndex, selection.endIndex) + 1,
	)
	return { rowIds: [], ...buildColumnSelection(selectedColumns) }
}

export function buildSingleCellSelection(
	rows: MagicBaseRow[],
	columns: MagicBaseGridColumn[],
	cell: CellCoordinate,
): MagicBaseCellSelection {
	const row = rows[cell.rowIndex]
	const column = columns[cell.columnIndex]
	const rowId = row ? getRowRecordId(row) : ""
	return {
		rowIds: rowId ? [rowId] : [],
		columnIds: column?.source === "schema" && column.id ? [column.id] : [],
		columnKeys: column ? [column.key] : [],
	}
}

export function isCellWithinSelection(
	cell: CellCoordinate,
	start: CellCoordinate | null,
	end: CellCoordinate | null,
) {
	if (!start || !end) return false
	return (
		cell.rowIndex >= Math.min(start.rowIndex, end.rowIndex) &&
		cell.rowIndex <= Math.max(start.rowIndex, end.rowIndex) &&
		cell.columnIndex >= Math.min(start.columnIndex, end.columnIndex) &&
		cell.columnIndex <= Math.max(start.columnIndex, end.columnIndex)
	)
}
