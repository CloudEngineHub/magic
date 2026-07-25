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
