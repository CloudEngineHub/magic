const SCRIPT_OPEN_TOKEN = "<script"
const SCRIPT_CLOSE_TOKEN = "</script"

function isTagNameBoundary(character: string | undefined) {
	return character === undefined || /[\s/>]/.test(character)
}

function findToken(
	normalizedSource: string,
	token: string,
	fromIndex: number,
	options: { ignoreHtmlComments?: boolean } = {},
) {
	const { ignoreHtmlComments = true } = options
	let tokenIndex = normalizedSource.indexOf(token, fromIndex)

	while (tokenIndex >= 0) {
		if (ignoreHtmlComments) {
			const commentStart = normalizedSource.lastIndexOf("<!--", tokenIndex)
			const commentEnd = normalizedSource.lastIndexOf("-->", tokenIndex)
			if (commentStart > commentEnd) {
				const nextCommentEnd = normalizedSource.indexOf("-->", tokenIndex)
				if (nextCommentEnd < 0) return -1
				tokenIndex = normalizedSource.indexOf(token, nextCommentEnd + 3)
				continue
			}
		}

		if (isTagNameBoundary(normalizedSource[tokenIndex + token.length])) return tokenIndex
		tokenIndex = normalizedSource.indexOf(token, tokenIndex + token.length)
	}

	return -1
}

function findTrailingPartialScriptStart(source: string, normalizedSource: string) {
	const lastTagStart = source.lastIndexOf("<")
	if (lastTagStart < 0) return null

	const normalizedCandidate = source.slice(lastTagStart).toLowerCase()
	if (
		normalizedCandidate.length >= SCRIPT_OPEN_TOKEN.length ||
		!SCRIPT_OPEN_TOKEN.startsWith(normalizedCandidate)
	) {
		return null
	}

	const commentStart = normalizedSource.lastIndexOf("<!--", lastTagStart)
	const commentEnd = normalizedSource.lastIndexOf("-->", lastTagStart)
	return commentStart > commentEnd ? null : lastTagStart
}

function findTagEnd(source: string, fromIndex: number) {
	let quote: '"' | "'" | null = null

	for (let index = fromIndex; index < source.length; index += 1) {
		const character = source[index]
		if (quote) {
			if (character === quote) quote = null
			continue
		}

		if (character === '"' || character === "'") {
			quote = character
			continue
		}

		if (character === ">") return index
	}

	return -1
}

/**
 * Returns the first script element that is incomplete in the current streaming prefix.
 * HTML parsers auto-close a partial script element, but that would execute an invalid
 * JavaScript prefix. Keeping the unsafe tail out of the iframe preserves the last valid UI.
 */
export function findIncompleteStreamingScriptStart(source: string): number | null {
	const normalizedSource = source.toLowerCase()
	let searchIndex = 0

	while (searchIndex < source.length) {
		const scriptStart = findToken(normalizedSource, SCRIPT_OPEN_TOKEN, searchIndex)
		if (scriptStart < 0) return findTrailingPartialScriptStart(source, normalizedSource)

		const openingTagEnd = findTagEnd(source, scriptStart + SCRIPT_OPEN_TOKEN.length)
		if (openingTagEnd < 0) return scriptStart

		const closingTagStart = findToken(normalizedSource, SCRIPT_CLOSE_TOKEN, openingTagEnd + 1, {
			ignoreHtmlComments: false,
		})
		if (closingTagStart < 0) return scriptStart

		const closingTagEnd = findTagEnd(source, closingTagStart + SCRIPT_CLOSE_TOKEN.length)
		if (closingTagEnd < 0) return scriptStart

		searchIndex = closingTagEnd + 1
	}

	return null
}

export function resolveStreamingHtmlCommitContent(source: string) {
	const incompleteScriptStart = findIncompleteStreamingScriptStart(source)
	return incompleteScriptStart === null ? source : source.slice(0, incompleteScriptStart)
}
