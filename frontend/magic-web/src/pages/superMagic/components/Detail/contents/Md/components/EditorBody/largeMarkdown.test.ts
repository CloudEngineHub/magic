import { describe, expect, it } from "vitest"
import {
	LARGE_MARKDOWN_THRESHOLD_BYTES,
	exceedsUtf8ByteLimit,
	getVirtualMarkdownChunkContent,
	isLargeMarkdownContent,
	splitMarkdownIntoVirtualChunks,
} from "./largeMarkdown"

describe("large markdown utilities", () => {
	it("uses UTF-8 byte size for the 3 MB boundary", () => {
		expect(isLargeMarkdownContent("a".repeat(LARGE_MARKDOWN_THRESHOLD_BYTES))).toBe(false)
		expect(isLargeMarkdownContent("a".repeat(LARGE_MARKDOWN_THRESHOLD_BYTES + 1))).toBe(true)
		expect(exceedsUtf8ByteLimit("你", 2)).toBe(true)
		expect(exceedsUtf8ByteLimit("😀", 3)).toBe(true)
	})

	it("splits a large document into source ranges without losing text", () => {
		const content = Array.from(
			{ length: 40 },
			(_, index) => `## Section ${index}\n\n${"paragraph ".repeat(20)}\n\n`,
		).join("")
		const chunks = splitMarkdownIntoVirtualChunks(content, 300, 600)

		expect(chunks.length).toBeGreaterThan(1)
		expect(chunks.map((chunk) => content.slice(chunk.start, chunk.end)).join("")).toBe(content)
		expect(chunks.flatMap((chunk) => chunk.headingSlugs)).toContain("section-0")
	})

	it("keeps split fenced-code chunks independently parseable", () => {
		const content = `\`\`\`json\n${'{"value":1}\n'.repeat(100)}\`\`\`\n`
		const chunks = splitMarkdownIntoVirtualChunks(content, 100, 180)
		const renderedChunks = chunks.map((chunk) => getVirtualMarkdownChunkContent(content, chunk))

		expect(chunks.length).toBeGreaterThan(1)
		renderedChunks.forEach((chunkContent, index) => {
			expect(
				chunkContent.startsWith("```json"),
				`chunk ${index} opening fence: ${JSON.stringify(chunkContent.slice(0, 30))}`,
			).toBe(true)
			expect(
				chunkContent.trimEnd().endsWith("```"),
				`chunk ${index} closing fence: ${JSON.stringify(chunkContent.slice(-30))}`,
			).toBe(true)
		})
	})

	it("generates stable unique slugs for duplicate headings", () => {
		const content = `# Duplicate\n\n${"x".repeat(80)}\n\n# Duplicate\n`
		const chunks = splitMarkdownIntoVirtualChunks(content, 50, 100)

		expect(chunks.flatMap((chunk) => chunk.headingSlugs)).toEqual(["duplicate", "duplicate-1"])
	})
})
