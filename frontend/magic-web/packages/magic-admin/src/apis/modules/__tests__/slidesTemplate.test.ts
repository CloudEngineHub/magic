import { describe, expect, it, vi } from "vitest"
import { RequestUrl } from "../../constant"
import { generateSlidesTemplateApi } from "../slidesTemplate"

function createClient() {
	return {
		get: vi.fn((url: string) => ({ method: "get", url })),
		post: vi.fn((url: string, data?: unknown) => ({ method: "post", url, data })),
		put: vi.fn((url: string, data?: unknown) => ({ method: "put", url, data })),
		delete: vi.fn((url: string) => ({ method: "delete", url })),
	}
}

describe("SlidesTemplateApi", () => {
	it("maps query API", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)
		const params = { page: 1, page_size: 20, keyword: "whitepaper" }

		api.query(params)

		expect(client.post).toHaveBeenCalledWith(RequestUrl.querySlidesTemplates, params)
	})

	it("maps detail, update status, update sort, and delete APIs", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)

		api.detail("123")
		api.updateStatus("123", 1)
		api.updateSort("123", 100)
		api.delete("123")

		expect(client.get).toHaveBeenCalledWith("/api/v1/admin/slides-templates/123")
		expect(client.put).toHaveBeenCalledWith("/api/v1/admin/slides-templates/123/status", {
			status: 1,
		})
		expect(client.put).toHaveBeenCalledWith("/api/v1/admin/slides-templates/123/sort", {
			sort: 100,
		})
		expect(client.delete).toHaveBeenCalledWith("/api/v1/admin/slides-templates/123")
	})

	it("maps create and update payloads", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)
		const payload = {
			code: "PPT-Abc123",
			category_code: "PPT-CATE-business",
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: null,
			preview_image_file_keys: ["preview-1.png", "preview-2.png"],
			template_file_key: "template.zip",
			preview_url: null,
			status: 1,
			sort: 10,
		}

		api.create(payload)
		api.update("123", payload)

		expect(client.post).toHaveBeenCalledWith(RequestUrl.createSlidesTemplate, payload)
		expect(client.put).toHaveBeenCalledWith("/api/v1/admin/slides-templates/123", payload)
	})

	it("maps category query API", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)
		const params = { page: 1, page_size: 20, keyword: "business" }

		api.category.query(params)

		expect(client.post).toHaveBeenCalledWith(RequestUrl.querySlidesTemplateCategories, params)
	})

	it("maps category detail, status, sort, and delete APIs", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)

		api.category.detail("123")
		api.category.updateStatus("123", 1)
		api.category.updateSort("123", 100)
		api.category.delete("123")

		expect(client.get).toHaveBeenCalledWith("/api/v1/admin/slides-template-categories/123")
		expect(client.put).toHaveBeenCalledWith(
			"/api/v1/admin/slides-template-categories/123/status",
			{ status: 1 },
		)
		expect(client.put).toHaveBeenCalledWith(
			"/api/v1/admin/slides-template-categories/123/sort",
			{ sort: 100 },
		)
		expect(client.delete).toHaveBeenCalledWith("/api/v1/admin/slides-template-categories/123")
	})

	it("maps category create and update payloads", () => {
		const client = createClient()
		const api = generateSlidesTemplateApi(client as never)
		const payload = {
			code: "PPT-CATE-business",
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: 1,
			sort: 10,
		}

		api.category.create(payload)
		api.category.update("123", payload)

		expect(client.post).toHaveBeenCalledWith(RequestUrl.createSlidesTemplateCategory, payload)
		expect(client.put).toHaveBeenCalledWith(
			"/api/v1/admin/slides-template-categories/123",
			payload,
		)
	})
})
