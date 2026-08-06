import { describe, expect, it } from "vitest"
import type { MagicBaseTable } from "@/apis/modules/magicBase"
import {
	getFilterableColumns,
	getFilterOperators,
	isValidDraftFilterCondition,
	toFilterCondition,
} from "../dataFilterRules"
import {
	buildGridColumns,
	buildMagicBaseRowsRequest,
	buildMagicBaseSelect,
	getDefaultSort,
	getDisplayColumns,
	normalizeMagicBaseBooleanValue,
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
			filter: { logic: "and", items: [] },
			sort: [{ field: "created_at", order: "desc" }],
			page: 2,
			page_size: 20,
			include_total: false,
		})
	})

	it("builds grouped filters without exposing storage expressions", () => {
		expect(
			buildMagicBaseRowsRequest({
				table,
				sort: null,
				page: 1,
				filter: {
					logic: "or",
					items: [
						{ field: "brand", operator: "contains", value: "Apple" },
						{ field: "price", operator: "gte", value: 5999 },
					],
				},
			}),
		).toEqual(
			expect.objectContaining({
				filter: {
					logic: "or",
					items: [
						{ field: "brand", operator: "contains", value: "Apple" },
						{ field: "price", operator: "gte", value: 5999 },
					],
				},
				include_total: false,
			}),
		)
	})

	it("normalizes historical boolean scalar values", () => {
		expect(normalizeMagicBaseBooleanValue(true)).toBe(true)
		expect(normalizeMagicBaseBooleanValue(1)).toBe(true)
		expect(normalizeMagicBaseBooleanValue("1")).toBe(true)
		expect(normalizeMagicBaseBooleanValue("true")).toBe(true)
		expect(normalizeMagicBaseBooleanValue(false)).toBe(false)
		expect(normalizeMagicBaseBooleanValue(0)).toBe(false)
		expect(normalizeMagicBaseBooleanValue("0")).toBe(false)
		expect(normalizeMagicBaseBooleanValue("false")).toBe(false)
	})

	it("includes system fields in filters after dynamic fields", () => {
		const columns = getFilterableColumns(getDisplayColumns(table))

		expect(columns.map((column) => column.column_key)).toEqual([
			"brand",
			"id",
			"organization_code",
			"created_by",
			"created_at",
			"updated_at",
		])
		expect(getFilterOperators(columns.find((column) => column.column_key === "id"))).toEqual([
			"eq",
			"gt",
			"gte",
			"lt",
			"lte",
			"in",
		])
	})

	it("keeps record ID filter values as validated integer strings", () => {
		const idColumn = getFilterableColumns(getDisplayColumns(table)).find(
			(column) => column.column_key === "id",
		)
		expect(idColumn).toBeDefined()
		if (!idColumn) return

		const condition = {
			field: "id",
			operator: "eq" as const,
			value: "9223372036854775807",
		}
		expect(isValidDraftFilterCondition(condition, [idColumn])).toBe(true)
		expect(toFilterCondition(idColumn, condition)).toEqual({
			field: "id",
			operator: "eq",
			value: "9223372036854775807",
		})
		expect(isValidDraftFilterCondition({ ...condition, value: "1.5" }, [idColumn])).toBe(false)
		expect(isValidDraftFilterCondition({ ...condition, value: "not-an-id" }, [idColumn])).toBe(
			false,
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
