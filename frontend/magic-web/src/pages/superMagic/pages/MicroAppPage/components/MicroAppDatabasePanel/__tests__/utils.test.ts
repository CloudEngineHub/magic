import { describe, expect, it } from "vitest"
import type { MagicBaseTable } from "@/apis/modules/magicBase"
import {
	buildGridColumns,
	buildMagicBaseRowsRequest,
	buildMagicBaseSelect,
	getDefaultSort,
	getDisplayColumns,
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
		expect(buildMagicBaseSelect(table)).toBe(
			"id,brand,organization_code,created_by,created_at,updated_at",
		)
	})

	it("uses created_at desc as default sort", () => {
		expect(getDefaultSort()).toEqual({ field: "created_at", order: "desc" })
	})

	it("combines system columns and enabled schema columns", () => {
		expect(getDisplayColumns(table).map((column) => column.column_key)).toEqual([
			"id",
			"brand",
			"organization_code",
			"created_by",
			"created_at",
			"updated_at",
		])
	})

	it("builds row query body with empty filter and fixed page size", () => {
		expect(
			buildMagicBaseRowsRequest({
				table,
				sort: { field: "created_at", order: "desc" },
				page: 2,
			}),
		).toEqual({
			select: "id,brand,organization_code,created_by,created_at,updated_at",
			filter: {},
			sort: [{ field: "created_at", order: "desc" }],
			page: 2,
			page_size: 20,
		})
	})

	it("builds exact-match filters for multiple columns", () => {
		expect(
			buildMagicBaseRowsRequest({
				table,
				sort: null,
				page: 1,
				filters: [
					{ field: "brand", value: "Apple" },
					{ field: "price", value: 5999 },
				],
			}),
		).toEqual(
			expect.objectContaining({
				filter: {
					brand: { eq: "Apple" },
					price: { eq: 5999 },
				},
			}),
		)
	})

	it("hides system fields from the default data grid without changing the query fields", () => {
		expect(
			buildGridColumns(table, [{ id: "1", brand: "Apple", extra: "x" }]).map((c) => c.key),
		).toEqual(["brand", "extra"])
	})

	it("adds system fields when the user chooses to show them", () => {
		expect(
			buildGridColumns(table, [{ id: "1", brand: "Apple", extra: "x" }], true).map(
				(column) => column.key,
			),
		).toEqual([
			"id",
			"brand",
			"extra",
			"organization_code",
			"created_by",
			"created_at",
			"updated_at",
		])
	})
})
