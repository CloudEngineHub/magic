import type { MagicBaseRow, MagicBaseSortRule } from "@/apis/modules/magicBase"

import type { MagicBaseGridColumn } from "./utils"

export interface MagicBaseCellSelection {
	rowIds: string[]
	columnIds: string[]
	columnKeys: string[]
}

export interface CellCoordinate {
	rowIndex: number
	columnIndex: number
}

export interface ContextMenuPosition {
	x: number
	y: number
}

export interface DataGridProps {
	columns: MagicBaseGridColumn[]
	rows: MagicBaseRow[]
	sort: MagicBaseSortRule | null
	loading: boolean
	total: number
	totalKnown: boolean
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
