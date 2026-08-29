import { describe, expect, it } from "vitest"
import { getFileExtension } from "../src/parsers/parseMedia"

describe("media extension resolution", () => {
	it("reads the extension from an ordinary pathname", () => {
		expect(getFileExtension("images/demo.mp4")).toBe("mp4")
	})

	it("reads the filename from signed object-storage metadata", () => {
		expect(
			getFileExtension(
				"https://cdn.example.test/workspace/123?response-content-disposition=inline%3B%20filename%3D%22demo.mp4%22",
			),
		).toBe("mp4")
	})

	it("reads the MIME type when the signed URL has no filename", () => {
		expect(
			getFileExtension("https://cdn.example.test/workspace/123?response-content-type=video%2Fmp4"),
		).toBe("mp4")
	})

	it("does not return query-string data as an extension", () => {
		expect(
			getFileExtension(
				"https://cdn.example.test/workspace/123?X-Tos-Signature=abc%22%26response-content-type%3Dvideo%2Fmp4",
			),
		).toBeUndefined()
	})
})
