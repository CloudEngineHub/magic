import { describe, expect, it, vi } from "vitest"
import { generateMagicBaseApi, normalizeMagicBaseTable } from "../magicBase"

describe("MagicBaseApi", () => {
	it("normalizes large ids to strings", () => {
		const table = normalizeMagicBaseTable({
			id: "932694802891345920",
			project_id: 123,
			table_key: "mobile_survey",
			table_name: "Mobile Survey",
			status: "enabled",
			columns: [
				{
					id: "932694803314970624",
					table_id: "932694802891345920",
					column_key: "brand",
					column_name: "Brand",
					data_type: "text",
					is_required: false,
					status: "enabled",
				},
			],
		})

		expect(table.id).toBe("932694802891345920")
		expect(table.project_id).toBe("123")
		expect(table.columns[0].id).toBe("932694803314970624")
	})

	it("uses large integer parsing for list, detail, and row queries", async () => {
		const client = {
			get: vi.fn().mockResolvedValue([]),
			post: vi.fn().mockResolvedValue({ page: 1, page_size: 20, total: 0, list: [] }),
		} as any
		const api = generateMagicBaseApi(client)

		await api.getTables("project-1")
		await api.getTable("project-1", "table-1")
		await api.queryRows("project-1", "table-1", {
			select: "id,name",
			filter: {},
			sort: [{ field: "created_at", order: "desc" }],
			page: 1,
			page_size: 20,
		})

		expect(client.get).toHaveBeenNthCalledWith(
			1,
			"/api/v1/magicbase/projects/project-1/tables",
			{ parseJsonLargeIntAsString: true },
		)
		expect(client.get).toHaveBeenNthCalledWith(
			2,
			"/api/v1/magicbase/projects/project-1/tables/table-1",
			{ parseJsonLargeIntAsString: true },
		)
		expect(client.post).toHaveBeenCalledWith(
			"/api/v1/magicbase/projects/project-1/tables/table-1/query",
			{
				select: "id,name",
				filter: {},
				sort: [{ field: "created_at", order: "desc" }],
				page: 1,
				page_size: 20,
			},
			{ parseJsonLargeIntAsString: true },
		)
	})
})
