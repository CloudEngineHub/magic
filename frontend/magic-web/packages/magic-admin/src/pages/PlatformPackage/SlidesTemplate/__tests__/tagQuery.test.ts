import { describe, expect, it } from "vitest"
import { buildSlidesTemplateTagQueryParams } from "../tagQuery"

describe("buildSlidesTemplateTagQueryParams", () => {
	it("queries all tags without parent_id", () => {
		expect(
			buildSlidesTemplateTagQueryParams({
				page: 1,
				pageSize: 20,
				parentId: null,
			}),
		).toEqual({
			page: 1,
			page_size: 20,
			node_type: "tag",
			keyword: undefined,
			code: undefined,
			status: null,
		})
	})

	it("queries tags in the selected group with normalized filters", () => {
		expect(
			buildSlidesTemplateTagQueryParams({
				page: 2,
				pageSize: 50,
				parentId: "935319168713744400",
				filters: {
					keyword: "  report  ",
					code: "  purpose-annual-report  ",
					status: 1,
				},
			}),
		).toEqual({
			page: 2,
			page_size: 50,
			parent_id: "935319168713744400",
			node_type: "tag",
			keyword: "report",
			code: "purpose-annual-report",
			status: 1,
		})
	})
})
