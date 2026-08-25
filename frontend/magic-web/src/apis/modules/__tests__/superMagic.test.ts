import { describe, expect, it, vi } from "vitest"
import type { HttpClient } from "../../core/HttpClient"
import { generateSuperMagicApi } from "../superMagic"

const imageProcessOptions = {
	xMagicImageProcess: {
		resize: { w: 1920 },
		format: "webp" as const,
	},
}

describe("generateSuperMagicApi", () => {
	it.each([
		{
			name: "template list",
			request: (api: ReturnType<typeof generateSuperMagicApi>) =>
				api.getSlidesTemplates({ page: 1, page_size: 20 }, imageProcessOptions),
			expectedUrl: "/api/v1/slides-templates?scope=official&page=1&page_size=20",
		},
		{
			name: "template detail",
			request: (api: ReturnType<typeof generateSuperMagicApi>) =>
				api.getSlidesTemplateDetail("business", imageProcessOptions),
			expectedUrl: "/api/v1/slides-templates/business",
		},
	])(
		"passes image compression parameters to the $name request",
		async ({ request, expectedUrl }) => {
			const get = vi.fn().mockResolvedValue({})
			const api = generateSuperMagicApi({ get } as unknown as HttpClient)

			await request(api)

			expect(get).toHaveBeenCalledWith(expectedUrl, {
				headers: {
					"X-Magic-Image-Process": "resize=w:1920&format=webp",
				},
			})
		},
	)

	it("uses the personal template endpoints and code as the resource identity", async () => {
		const get = vi.fn().mockResolvedValue({})
		const post = vi.fn().mockResolvedValue([])
		const deleteRequest = vi.fn().mockResolvedValue([])
		const api = generateSuperMagicApi({
			get,
			post,
			delete: deleteRequest,
		} as unknown as HttpClient)

		await api.getSlidesTemplates({
			scope: "user",
			code: "PPT-created",
			page: 2,
			page_size: 40,
		})
		await api.getFavoriteSlidesTemplates({ page: 1, page_size: 40, keyword: "sales" })
		await api.getUsedSlidesTemplates({ page: 3, page_size: 40 })
		await api.getSlidesTemplateCodeAvailability("PPT-owned")
		await api.favoriteSlidesTemplate("PPT-owned")
		await api.unfavoriteSlidesTemplate("PPT-owned")
		await api.deleteSlidesTemplate("PPT-owned")
		await api.getSlidesTemplateTags({ page: 1, page_size: 20, keyword: "报告" })
		await api.saveSlidesTemplate({
			label: { zh_CN: "我的模板", en_US: "My template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumbnail.png",
			template_file_key: "template.zip",
		})

		expect(get).toHaveBeenNthCalledWith(
			1,
			"/api/v1/slides-templates?scope=user&code=PPT-created&page=2&page_size=40",
			{ headers: {} },
		)
		expect(get).toHaveBeenNthCalledWith(
			2,
			"/api/v1/slides-templates/favorites?page=1&page_size=40&keyword=sales",
			{ headers: {} },
		)
		expect(get).toHaveBeenNthCalledWith(
			3,
			"/api/v1/slides-templates/used?page=3&page_size=40",
			{ headers: {} },
		)
		expect(get).toHaveBeenNthCalledWith(4, "/api/v1/slides-templates/PPT-owned/availability")
		expect(post).toHaveBeenCalledWith("/api/v1/slides-templates/PPT-owned/favorite")
		expect(deleteRequest).toHaveBeenCalledWith("/api/v1/slides-templates/PPT-owned/favorite")
		expect(deleteRequest).toHaveBeenCalledWith("/api/v1/slides-templates/PPT-owned")
		expect(get).toHaveBeenNthCalledWith(
			5,
			"/api/v1/slides-template-tags?page=1&page_size=20&keyword=%E6%8A%A5%E5%91%8A",
		)
		expect(post).toHaveBeenNthCalledWith(2, "/api/v1/slides-templates", {
			label: { zh_CN: "我的模板", en_US: "My template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumbnail.png",
			template_file_key: "template.zip",
		})
	})
})
