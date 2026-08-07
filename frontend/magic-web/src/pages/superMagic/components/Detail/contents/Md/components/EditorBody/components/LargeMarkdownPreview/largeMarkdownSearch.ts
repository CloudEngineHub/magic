import type { VirtualMarkdownChunk } from "../../largeMarkdown"

export interface MarkdownSearchResult {
	id: string
	chunkIndex: number
	start: number
	end: number
	preview: string
}

export interface MarkdownSearchRequest {
	content: string
	chunks: VirtualMarkdownChunk[]
	query: string
	caseSensitive: boolean
}

const MAX_SEARCH_RESULTS = 1000

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getChunkIndex(chunks: VirtualMarkdownChunk[], start: number, end: number): number {
	// A match that crosses a chunk boundary is navigated from the chunk containing its start.
	// This keeps navigation deterministic while the highlight plugin can decorate both sides.
	const index = chunks.findIndex((chunk) => start < chunk.end && end > chunk.start)
	return index === -1 ? 0 : index
}

export function searchMarkdown({
	content,
	chunks,
	query,
	caseSensitive,
}: MarkdownSearchRequest): MarkdownSearchResult[] {
	if (!query) return []

	const matcher = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi")
	const results: MarkdownSearchResult[] = []
	let match: RegExpExecArray | null

	while ((match = matcher.exec(content)) !== null && results.length < MAX_SEARCH_RESULTS) {
		const start = match.index
		const end = start + match[0].length
		const previewStart = Math.max(0, start - 24)
		const previewEnd = Math.min(content.length, end + 24)
		results.push({
			id: `markdown-search-result-${results.length}`,
			chunkIndex: getChunkIndex(chunks, start, end),
			start,
			end,
			preview: content.slice(previewStart, previewEnd),
		})

		// Guard against the empty-match behaviour if this helper is changed to accept patterns later.
		if (match[0].length === 0) matcher.lastIndex += 1
	}

	return results
}

export { MAX_SEARCH_RESULTS }
