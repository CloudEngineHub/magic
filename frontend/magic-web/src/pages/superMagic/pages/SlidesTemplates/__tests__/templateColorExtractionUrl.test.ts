import { describe, expect, it } from "vitest"
import { resolveTrustedTemplateColorUrl } from "../templateColorExtractionUrl"

describe("template color extraction URL validation", () => {
	const currentOrigin = "https://magic.example.com"

	it("allows same-origin, configured CDN, and trusted TOS images", () => {
		expect(
			resolveTrustedTemplateColorUrl({
				currentOrigin,
				imageUrl: "/templates/cover.png",
			})?.origin,
		).toBe(currentOrigin)
		expect(
			resolveTrustedTemplateColorUrl({
				allowedOrigins: ["https://cdn.example.com/assets"],
				currentOrigin,
				imageUrl: "https://cdn.example.com/templates/cover.png",
			})?.origin,
		).toBe("https://cdn.example.com")
		expect(
			resolveTrustedTemplateColorUrl({
				currentOrigin,
				imageUrl: "https://bucket.tos-cn-beijing.volces.com/templates/cover.png",
			})?.hostname,
		).toBe("bucket.tos-cn-beijing.volces.com")
	})

	it("rejects arbitrary external origins, credentials, and non-http protocols", () => {
		expect(
			resolveTrustedTemplateColorUrl({
				currentOrigin,
				imageUrl: "https://tracker.example.net/cover.png",
			}),
		).toBeNull()
		expect(
			resolveTrustedTemplateColorUrl({
				allowedOrigins: ["https://cdn.example.com"],
				currentOrigin,
				imageUrl: "https://user:password@cdn.example.com/cover.png",
			}),
		).toBeNull()
		expect(
			resolveTrustedTemplateColorUrl({
				currentOrigin,
				imageUrl: "data:image/png;base64,AAAA",
			}),
		).toBeNull()
	})
})
