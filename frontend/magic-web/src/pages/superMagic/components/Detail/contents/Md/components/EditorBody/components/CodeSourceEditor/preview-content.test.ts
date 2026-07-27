import { describe, expect, it } from "vitest"
import { formatLongCurlDataRawForPreview } from "./preview-content"

describe("formatLongCurlDataRawForPreview", () => {
	it("formats a long JSON --data-raw payload into physical preview lines", () => {
		const payload = JSON.stringify({ events: Array.from({ length: 200 }, (_, id) => ({ id })) })
		const source = `curl https://example.com --data-raw '${payload}'`

		const result = formatLongCurlDataRawForPreview(source)

		expect(result).toContain("--data-raw '{\n")
		expect(result).toContain('"events": [')
		expect(result).toContain("\n}'")
	})

	it("leaves a non-JSON payload unchanged", () => {
		const source = `curl https://example.com --data-raw '${"x".repeat(1_001)}'`

		expect(formatLongCurlDataRawForPreview(source)).toBe(source)
	})

	it("returns ordinary source unchanged", () => {
		const source = "# Heading\n\nA regular Markdown document without a curl command."

		expect(formatLongCurlDataRawForPreview(source)).toBe(source)
	})
})
