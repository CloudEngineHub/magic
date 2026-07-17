import { describe, expect, it } from "vitest"
import { resolveImageMime, shouldConvertImageToWebp } from "../src/materialize/image-format"

describe("html2pptx image output format", () => {
	it.each([
		["image/png", "https://example.com/image", true],
		["image/jpeg", "https://example.com/image", true],
		["image/jpg", "https://example.com/image", true],
		["", "https://example.com/image.png", true],
		["", "https://example.com/image.jpeg", true],
	])("converts static raster image %s %s to WebP", (mime, src, expected) => {
		expect(shouldConvertImageToWebp(mime, src)).toBe(expected)
	})

	it.each([
		["image/gif", "https://example.com/image.gif"],
		["image/svg+xml", "https://example.com/image.svg"],
		["image/webp", "https://example.com/image.webp"],
	])("preserves %s images", (mime, src) => {
		expect(shouldConvertImageToWebp(mime, src)).toBe(false)
	})

	it("prefers the fetched Blob MIME for signed URLs", () => {
		expect(resolveImageMime("image/gif", "https://example.com/download?id=1")).toBe("image/gif")
		expect(resolveImageMime("image/png", "https://example.com/download?id=1")).toBe("image/png")
	})

	it("falls back to the source extension for generic Blob MIME", () => {
		expect(
			shouldConvertImageToWebp("application/octet-stream", "https://example.com/image.png"),
		).toBe(true)
		expect(
			shouldConvertImageToWebp("image/octet-stream", "https://example.com/image.jpg"),
		).toBe(true)
	})

	it("recognizes encoded response-content-type parameters", () => {
		expect(
			resolveImageMime(
				"",
				"https://example.com/image?response-content-type=image%2Fsvg%2Bxml",
			),
		).toBe("image/svg+xml")
	})

	it("recognizes the format from object-storage content disposition", () => {
		expect(
			shouldConvertImageToWebp(
				"application/octet-stream",
				"https://example.com/download?response-content-disposition=attachment%3B%20filename%3Dphoto.jpg",
			),
		).toBe(true)
	})
})
