import type {
	MagicBaseColumn,
	MagicBaseQueryRowsRequest,
	MagicBaseRow,
	MagicBaseSortRule,
	MagicBaseTable,
} from "@/apis/modules/magicBase"

export const MAGIC_BASE_PAGE_SIZE = 20

export interface MagicBaseGridColumn {
	key: string
	name: string
	type?: string
	source?: "system" | "schema" | "row"
}

function appendUnique(fields: string[], field?: string) {
	if (!field || fields.includes(field)) return
	fields.push(field)
}

export function getEnabledColumns(table?: MagicBaseTable | null): MagicBaseColumn[] {
	return (table?.columns || []).filter((column) => column.status !== "disabled")
}

export function buildMagicBaseSelect(table?: MagicBaseTable | null): string {
	const fields: string[] = []
	appendUnique(fields, "id")
	getEnabledColumns(table).forEach((column) => appendUnique(fields, column.column_key))
	appendUnique(fields, "created_at")
	appendUnique(fields, "updated_at")
	return fields.join(",")
}

export function getDefaultSort(table?: MagicBaseTable | null): MagicBaseSortRule | null {
	const hasCreatedAt = getEnabledColumns(table).some(
		(column) => column.column_key === "created_at",
	)
	return hasCreatedAt ? { field: "created_at", order: "desc" } : null
}

export function buildMagicBaseRowsRequest(params: {
	table?: MagicBaseTable | null
	sort: MagicBaseSortRule | null
	page: number
}): MagicBaseQueryRowsRequest {
	return {
		select: buildMagicBaseSelect(params.table),
		filter: {},
		sort: params.sort ? [params.sort] : [],
		page: params.page,
		page_size: MAGIC_BASE_PAGE_SIZE,
	}
}

export function buildGridColumns(table?: MagicBaseTable | null, rows: MagicBaseRow[] = []) {
	const columns: MagicBaseGridColumn[] = [{ key: "id", name: "id", type: "id", source: "system" }]
	const knownKeys = new Set(columns.map((column) => column.key))

	getEnabledColumns(table).forEach((column) => {
		if (knownKeys.has(column.column_key)) return
		knownKeys.add(column.column_key)
		columns.push({
			key: column.column_key,
			name: column.column_name || column.column_key,
			type: column.data_type,
			source: "schema",
		})
	})

	rows.forEach((row) => {
		Object.keys(row).forEach((key) => {
			if (knownKeys.has(key)) return
			knownKeys.add(key)
			columns.push({ key, name: key, source: "row" })
		})
	})

	return columns
}

export function formatCellValue(value: unknown): string {
	if (value == null) return "NULL"
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}
