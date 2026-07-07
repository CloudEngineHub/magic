import type { HttpClient } from "@/apis/core/HttpClient"
import { genRequestUrl } from "@/utils/http"

export interface MagicBasePermissionScope {
	read_scope?: string
	insert_scope?: string
	edit_scope?: string
	delete_scope?: string
}

export interface MagicBaseDynamicPermissions {
	table?: MagicBasePermissionScope
	row?: MagicBasePermissionScope
	columns?: unknown[]
}

export interface MagicBaseColumn {
	id: string
	table_id: string
	column_key: string
	column_name: string
	data_type: string
	is_required: boolean
	status: string
	dynamic_permission?: MagicBasePermissionScope
	created_at?: string
	updated_at?: string
}

export interface MagicBaseTable {
	id: string
	project_id: string
	table_key: string
	table_name: string
	description?: string
	status: string
	dynamic_permissions?: MagicBaseDynamicPermissions
	created_by?: string
	created_at?: string
	updated_at?: string
	columns: MagicBaseColumn[]
}

export interface MagicBaseSortRule {
	field: string
	order: "asc" | "desc"
}

export interface MagicBaseQueryRowsRequest {
	select: string
	filter: Record<string, unknown>
	sort: MagicBaseSortRule[]
	page: number
	page_size: number
}

export type MagicBaseRow = Record<string, unknown>

export interface MagicBaseQueryRowsResponse {
	page: number
	page_size: number
	total: number
	list: MagicBaseRow[]
}

type RawMagicBaseColumn = Omit<MagicBaseColumn, "id" | "table_id"> & {
	id?: string | number
	table_id?: string | number
}

type RawMagicBaseTable = Omit<MagicBaseTable, "id" | "project_id" | "columns"> & {
	id?: string | number
	project_id?: string | number
	columns?: RawMagicBaseColumn[]
}

function toId(value: string | number | null | undefined): string {
	return value == null ? "" : String(value)
}

export function normalizeMagicBaseColumn(column: RawMagicBaseColumn): MagicBaseColumn {
	return {
		id: toId(column.id),
		table_id: toId(column.table_id),
		column_key: column.column_key || "",
		column_name: column.column_name || column.column_key || "",
		data_type: column.data_type || "",
		is_required: Boolean(column.is_required),
		status: column.status || "",
		dynamic_permission: column.dynamic_permission,
		created_at: column.created_at,
		updated_at: column.updated_at,
	}
}

export function normalizeMagicBaseTable(table: RawMagicBaseTable): MagicBaseTable {
	return {
		id: toId(table.id),
		project_id: toId(table.project_id),
		table_key: table.table_key || "",
		table_name: table.table_name || table.table_key || "",
		description: table.description,
		status: table.status || "",
		dynamic_permissions: table.dynamic_permissions,
		created_by: table.created_by,
		created_at: table.created_at,
		updated_at: table.updated_at,
		columns: (table.columns || []).map(normalizeMagicBaseColumn),
	}
}

export function generateMagicBaseApi(fetch: HttpClient) {
	const largeIntConfig = { parseJsonLargeIntAsString: true }

	return {
		async getTables(projectId: string): Promise<MagicBaseTable[]> {
			const data = await fetch.get<RawMagicBaseTable[]>(
				genRequestUrl("/api/v1/magicbase/projects/${projectId}/tables", { projectId }),
				largeIntConfig,
			)
			return data.map(normalizeMagicBaseTable)
		},

		async getTable(projectId: string, tableId: string): Promise<MagicBaseTable> {
			const data = await fetch.get<RawMagicBaseTable>(
				genRequestUrl("/api/v1/magicbase/projects/${projectId}/tables/${tableId}", {
					projectId,
					tableId,
				}),
				largeIntConfig,
			)
			return normalizeMagicBaseTable(data)
		},

		queryRows(
			projectId: string,
			tableId: string,
			body: MagicBaseQueryRowsRequest,
		): Promise<MagicBaseQueryRowsResponse> {
			return fetch.post<MagicBaseQueryRowsResponse>(
				genRequestUrl("/api/v1/magicbase/projects/${projectId}/tables/${tableId}/query", {
					projectId,
					tableId,
				}),
				body,
				largeIntConfig,
			)
		},
	}
}
