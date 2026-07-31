export const FILE_PATH_MENTION_PREFIX = "[@file_path:"

export interface FilePathMentionMatch {
	path: string
	startIndex: number
	endIndex: number
	fullMatch: string
}

function parseQuotedFilePath(
	content: string,
	start: number,
	quote: '"' | "'",
): { path: string; endIndex: number } | null {
	let index = start
	let path = ""

	while (index < content.length) {
		const char = content[index]
		if (char === "\\") {
			if (index + 1 >= content.length) return null
			path += content[index + 1]
			index += 2
			continue
		}
		if (char === quote) {
			index++
			if (content[index] === "]") {
				return { path, endIndex: index + 1 }
			}
			return null
		}
		path += char
		index++
	}

	return null
}

function sliceUntilNextMentionOrClose(content: string, start: number): string {
	let end = content.length
	const mentionIndex = content.indexOf(FILE_PATH_MENTION_PREFIX, start)
	if (mentionIndex !== -1) {
		end = Math.min(end, mentionIndex)
	}

	const closeIndex = content.indexOf("]", start)
	if (closeIndex !== -1) {
		end = Math.min(end, closeIndex)
	}

	return content.slice(start, end)
}

function looksLikePathSegment(segment: string): boolean {
	const trimmed = segment.trim()
	if (!trimmed) return false
	if (trimmed.includes("/") || trimmed.includes(".")) return true
	if (trimmed.startsWith("[")) return true
	return false
}

function hasPathContinuationAfter(content: string, indexAfterClose: number): boolean {
	let index = indexAfterClose
	while (index < content.length && content[index] === " ") {
		index++
	}
	if (index >= content.length) return false
	if (content[index] === "\n" || content[index] === "\r") return false
	if (content.startsWith(FILE_PATH_MENTION_PREFIX, index)) return false

	return looksLikePathSegment(sliceUntilNextMentionOrClose(content, index))
}

function parseUnquotedFilePath(
	content: string,
	start: number,
): { path: string; endIndex: number } | null {
	let depth = 0
	let index = start

	while (index < content.length) {
		const char = content[index]
		if (char === "[") {
			depth++
		} else if (char === "]") {
			if (depth === 0) {
				// A bare closing bracket deterministically ends an unquoted mention.
				// Paths containing an unmatched `]` must use the quoted syntax instead.
				return { path: content.slice(start, index), endIndex: index + 1 }
			}

			depth--
			if (depth === 0) {
				if (hasPathContinuationAfter(content, index + 1)) {
					index++
					continue
				}
				return { path: content.slice(start, index), endIndex: index + 1 }
			}
		}
		index++
	}

	return null
}

export function parseFilePathMentionAt(
	content: string,
	fromIndex = 0,
): FilePathMentionMatch | null {
	const startIndex = content.indexOf(FILE_PATH_MENTION_PREFIX, fromIndex)
	if (startIndex === -1) return null

	const pathStart = startIndex + FILE_PATH_MENTION_PREFIX.length
	if (pathStart >= content.length) return null

	const firstChar = content[pathStart]
	const parsed =
		firstChar === '"' || firstChar === "'"
			? parseQuotedFilePath(content, pathStart + 1, firstChar)
			: parseUnquotedFilePath(content, pathStart)

	if (!parsed) return null

	const path = parsed.path.trim()
	if (!path) return null

	return {
		path,
		startIndex,
		endIndex: parsed.endIndex,
		fullMatch: content.slice(startIndex, parsed.endIndex),
	}
}

export function extractFilePathMentions(content: string): FilePathMentionMatch[] {
	if (!content.includes(FILE_PATH_MENTION_PREFIX)) return []

	const matches: FilePathMentionMatch[] = []
	let searchFrom = 0

	while (searchFrom < content.length) {
		const prefixIndex = content.indexOf(FILE_PATH_MENTION_PREFIX, searchFrom)
		if (prefixIndex === -1) break

		const match = parseFilePathMentionAt(content, prefixIndex)
		if (match) {
			matches.push(match)
			searchFrom = match.endIndex
			continue
		}

		searchFrom = prefixIndex + 1
	}

	return matches
}

export function replaceFilePathMentions(
	content: string,
	replacer: (path: string, match: FilePathMentionMatch) => string,
): string {
	const matches = extractFilePathMentions(content)
	if (matches.length === 0) return content

	let result = ""
	let lastIndex = 0

	for (const match of matches) {
		result += content.slice(lastIndex, match.startIndex)
		result += replacer(match.path, match)
		lastIndex = match.endIndex
	}

	result += content.slice(lastIndex)
	return result
}
