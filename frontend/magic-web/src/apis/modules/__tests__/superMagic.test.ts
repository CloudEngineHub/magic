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
			expectedUrl: "/api/v1/slides-templates?page=1&page_size=20",
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
})
