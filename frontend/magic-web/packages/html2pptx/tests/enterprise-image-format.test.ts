import { describe, expect, it } from "vitest"
import { resolveImageMime, shouldConvertImageToWebp } from "../enterprise/src/materialize/image-format"

describe("enterprise image format policy", () => {
	it("converts only PNG and JPEG", () => {
		expect(shouldConvertImageToWebp("image/png")).toBe(true)
		expect(shouldConvertImageToWebp("image/jpeg")).toBe(true)
		expect(shouldConvertImageToWebp("image/gif")).toBe(false)
		expect(shouldConvertImageToWebp("image/svg+xml")).toBe(false)
		expect(shouldConvertImageToWebp("image/webp")).toBe(false)
	})

	it("resolves MIME from response and URL metadata", () => {
		expect(resolveImageMime("image/jpg; charset=binary", "unknown")).toBe("image/jpeg")
		expect(resolveImageMime("", "https://cdn.example.test/photo.PNG")).toBe("image/png")
		expect(resolveImageMime("", "https://cdn.example.test/animation.gif")).toBe("image/gif")
		expect(resolveImageMime("", "https://cdn.example.test/vector.svg")).toBe("image/svg+xml")
		expect(resolveImageMime("", "https://cdn.example.test/photo.webp")).toBe("image/webp")
	})
})
