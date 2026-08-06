import type { MagicBaseRow } from "@/apis/modules/magicBase"

import type { MagicBaseCellSelection } from "./DataGrid.types"
import type { MagicBaseGridColumn } from "./utils"

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

export function buildRowSelectionFromIndexes(
	rows: MagicBaseRow[],
	columns: MagicBaseGridColumn[],
	rowIndexes: number[],
): MagicBaseCellSelection {
	const rowIds = rowIndexes
		.map((rowIndex) => rows[rowIndex])
		.filter(Boolean)
		.map(getRowRecordId)
		.filter(Boolean)
	return {
		rowIds: [...new Set(rowIds)],
		...buildColumnSelection(columns),
	}
}

export function getRowIndexRange(startIndex: number, endIndex: number): number[] {
	const minIndex = Math.min(startIndex, endIndex)
	const maxIndex = Math.max(startIndex, endIndex)
	return Array.from({ length: maxIndex - minIndex + 1 }, (_, offset) => minIndex + offset)
}

export function mergeRowIndexes(...groups: number[][]): number[] {
	return [...new Set(groups.flat())].sort((a, b) => a - b)
}

export function toggleRowIndex(rowIndexes: number[], rowIndex: number): number[] {
	return rowIndexes.includes(rowIndex)
		? rowIndexes.filter((currentIndex) => currentIndex !== rowIndex)
		: mergeRowIndexes(rowIndexes, [rowIndex])
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
