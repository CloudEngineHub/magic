import { describe, expect, it } from "vitest"
import { splitMarkdownIntoVirtualChunks } from "../../largeMarkdown"
import { MAX_SEARCH_RESULTS, searchMarkdown } from "./largeMarkdownSearch"

describe("searchMarkdown", () => {
	it("returns literal matches with source offsets and chunk indexes", () => {
		const content = "Alpha\n\nBeta alpha"
		const chunks = splitMarkdownIntoVirtualChunks(content, 8, 12)

		expect(
			searchMarkdown({ content, chunks, query: "alpha", caseSensitive: false }),
		).toMatchObject([
			{ start: 0, end: 5, chunkIndex: 0 },
			{ start: 12, end: 17, chunkIndex: 1 },
		])
	})

	it("supports case-sensitive searches and empty queries", () => {
		const content = "Alpha alpha"
		const chunks = splitMarkdownIntoVirtualChunks(content)

		expect(
			searchMarkdown({ content, chunks, query: "alpha", caseSensitive: true }),
		).toHaveLength(1)
		expect(searchMarkdown({ content, chunks, query: "", caseSensitive: false })).toEqual([])
	})

	it("treats regex characters as literal text and caps results", () => {
		const content = `${"a+b ".repeat(MAX_SEARCH_RESULTS + 10)}`
		const chunks = splitMarkdownIntoVirtualChunks(content)
		const results = searchMarkdown({ content, chunks, query: "a+b", caseSensitive: true })

		expect(results).toHaveLength(MAX_SEARCH_RESULTS)
		expect(results[0]?.preview).toContain("a+b")
	})
})
