import type { MagicBaseRow } from "@/apis/modules/magicBase"

import type { MagicBaseCellSelection } from "./DataGrid"

export type RowEditorState =
	| {
			mode: "create"
			row?: null
	  }
	| {
			mode: "edit"
			row: MagicBaseRow
	  }

export const DATABASE_INTRO_DISMISSED_KEY = "MAGIC:micro-app-database-intro-dismissed"

export const EMPTY_CELL_SELECTION: MagicBaseCellSelection = {
	rowIds: [],
	columnIds: [],
	columnKeys: [],
}

export function getRowRecordId(row: MagicBaseRow): string {
	return String(row.id ?? row.record_id ?? "")
}
