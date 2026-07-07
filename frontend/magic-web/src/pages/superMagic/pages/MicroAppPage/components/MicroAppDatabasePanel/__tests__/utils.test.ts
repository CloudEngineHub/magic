import { describe, expect, it } from "vitest"
import type { MagicBaseTable } from "@/apis/modules/magicBase"
import {
	buildGridColumns,
	buildMagicBaseRowsRequest,
	buildMagicBaseSelect,
	getDefaultSort,
} from "../utils"

const table: MagicBaseTable = {
	id: "table-1",
	project_id: "project-1",
	table_key: "survey",
	table_name: "Survey",
	status: "enabled",
	columns: [
		{
			id: "column-1",
			table_id: "table-1",
			column_key: "brand",
			column_name: "Brand",
			data_type: "text",
			is_required: false,
			status: "enabled",
		},
		{
			id: "column-2",
			table_id: "table-1",
			column_key: "created_at",
			column_name: "Created At",
			data_type: "datetime",
			is_required: false,
			status: "enabled",
		},
		{
			id: "column-3",
			table_id: "table-1",
			column_key: "hidden",
			column_name: "Hidden",
			data_type: "text",
			is_required: false,
			status: "disabled",
		},
	],
}

describe("MicroAppDatabasePanel utils", () => {
	it("builds a deduplicated select list from enabled columns", () => {
		expect(buildMagicBaseSelect(table)).toBe("id,brand,created_at,updated_at")
	})

	it("uses created_at desc as default sort when the table has that column", () => {
		expect(getDefaultSort(table)).toEqual({ field: "created_at", order: "desc" })
	})

	it("builds row query body with empty filter and fixed page size", () => {
		expect(
			buildMagicBaseRowsRequest({
				table,
				sort: { field: "created_at", order: "desc" },
				page: 2,
			}),
		).toEqual({
			select: "id,brand,created_at,updated_at",
			filter: {},
			sort: [{ field: "created_at", order: "desc" }],
			page: 2,
			page_size: 20,
		})
	})

	it("adds row-only keys after schema columns", () => {
		expect(buildGridColumns(table, [{ id: "1", brand: "Apple", extra: "x" }]).map((c) => c.key))
			.toEqual(["id", "brand", "created_at", "extra"])
	})
})
