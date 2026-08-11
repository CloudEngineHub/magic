/**
 * Utilities for Markdown content processing
 * Re-exports common utilities from shared image-url-resolver module
 */

import MarkdownIt from "markdown-it"

// Export shared utilities from image-url-resolver
export {
	parseImageSize,
	normalizeImagePath,
	findFileByPath,
	resolveRelativePath,
	buildImageUrlMapEntries,
	extractImagePaths,
	isExternalUrl,
	processMarkdownImages,
	resolveSingleImageUrl,
} from "@/pages/superMagic/utils/image-url-resolver"

// Export types
export type {
	AttachmentFile,
	ResolvedImageData,
	ImageUrlMap,
} from "@/pages/superMagic/utils/image-url-resolver"

interface MarkdownToken {
	type: string
	content: string
	map: [number, number] | null
	children?: MarkdownToken[] | null
}

interface SourceRange {
	start: number
	end: number
}

interface HtmlSourceRange extends SourceRange {
	content: string
}

const markdownParser = new MarkdownIt({
	html: true,
	linkify: true,
	breaks: true,
})

const protectedHtmlTags = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"head",
	"meta",
	"link",
	"template",
	"noscript",
	"title",
	"base",
])

const voidHtmlTags = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
])

const urlAttributeNames = new Set([
	"href",
	"src",
	"xlink:href",
	"action",
	"formaction",
	"poster",
	"background",
	"cite",
	"manifest",
	"usemap",
])
const multiUrlAttributeNames = new Set(["srcset", "ping"])
const safeUrlProtocols = new Set(["http", "https", "mailto", "tel"])
const htmlRiskAttributePresencePattern =
	/\s+(?:on[a-z][\w:-]*|srcdoc|style|href|src|xlink:href|action|formaction|poster|background|cite|manifest|usemap|srcset|ping)\s*=/i

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function getHtmlTagDescriptor(html: string): {
	name: string
	isClosing: boolean
	isSelfClosing: boolean
} | null {
	const match = html.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b[\s\S]*>$/i)
	if (!match) return null

	return {
		name: match[2].toLowerCase(),
		isClosing: match[1] === "/",
		isSelfClosing: /\/\s*>$/.test(html),
	}
}

function removeProtocolWhitespaceAndControls(value: string): string {
	return Array.from(value)
		.filter((character) => {
			const codePoint = character.codePointAt(0) ?? 0
			return codePoint > 0x20 && (codePoint < 0x7f || codePoint > 0x9f)
		})
		.join("")
}

function isSafeUrlAttribute(attributeName: string, value: string): boolean {
	const normalizedValue = removeProtocolWhitespaceAndControls(value)
	if (!normalizedValue) return true

	const protocolMatch = normalizedValue.match(/^([a-z][a-z0-9+.-]*):/i)
	if (!protocolMatch) return true

	const protocol = protocolMatch[1].toLowerCase()
	if (safeUrlProtocols.has(protocol)) return true

	return (
		protocol === "data" &&
		(attributeName === "src" || attributeName === "poster") &&
		/^data:image\/(?:avif|gif|jpe?g|png|webp);base64,/i.test(normalizedValue)
	)
}

function hasDangerousStyleValue(styleValue: string): boolean {
	const normalizedStyle = removeProtocolWhitespaceAndControls(styleValue)
	if (/expression\s*\(/i.test(normalizedStyle)) return true

	for (const match of normalizedStyle.matchAll(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi)) {
		const urlValue = match[2]
		if (urlValue.includes("\\") || !isSafeUrlAttribute("style", urlValue)) return true
	}

	return false
}

function hasDangerousHtmlAttributes(html: string): boolean {
	if (typeof DOMParser === "undefined") {
		// Rendering without a DOM parser is uncommon for this client-only flow.
		// Fall back conservatively rather than allowing an encoded value through.
		return htmlRiskAttributePresencePattern.test(html)
	}

	const document = new DOMParser().parseFromString(html, "text/html")
	let inspectedRiskAttribute = false

	for (const element of Array.from(document.querySelectorAll("*"))) {
		for (const attribute of Array.from(element.attributes)) {
			const attributeName = attribute.name.toLowerCase()
			if (attributeName.startsWith("on") || attributeName === "srcdoc") return true

			if (attributeName === "style") {
				inspectedRiskAttribute = true
				if (hasDangerousStyleValue(attribute.value)) return true
				continue
			}

			if (multiUrlAttributeNames.has(attributeName)) return true

			if (urlAttributeNames.has(attributeName)) {
				inspectedRiskAttribute = true
				if (!isSafeUrlAttribute(attributeName, attribute.value)) return true
			}
		}
	}

	// If malformed/container-sensitive HTML prevented DOMParser from exposing a
	// risky attribute, prefer rendering it as code instead of trusting raw text.
	return !inspectedRiskAttribute && htmlRiskAttributePresencePattern.test(html)
}

function shouldRenderHtmlAsCode(html: string): boolean {
	const tagNames = Array.from(html.matchAll(/<\s*\/?\s*([a-z][\w:-]*)\b/gi)).map((match) =>
		match[1].toLowerCase(),
	)

	return (
		tagNames.some((tagName) => protectedHtmlTags.has(tagName)) ||
		hasDangerousHtmlAttributes(html)
	)
}

function collectHtmlInlineContents(tokens: MarkdownToken[]): string[] {
	const contents: string[] = []
	for (const token of tokens) {
		for (const child of token.children ?? []) {
			if (child.type === "html_inline") contents.push(child.content)
		}
	}
	return contents
}

function collectRelevantHtmlInlineContents(tokens: MarkdownToken[]): string[] {
	const htmlContents = collectHtmlInlineContents(tokens)
	const selectedIndexes = new Set<number>()
	const openTags = new Map<string, Array<{ index: number; dangerous: boolean }>>()

	for (const [index, content] of htmlContents.entries()) {
		const descriptor = getHtmlTagDescriptor(content)
		if (!descriptor) continue

		const dangerous = shouldRenderHtmlAsCode(content)
		const isVoid = descriptor.isSelfClosing || voidHtmlTags.has(descriptor.name)

		if (descriptor.isClosing) {
			const openingTag = openTags.get(descriptor.name)?.pop()
			if (openingTag?.dangerous || protectedHtmlTags.has(descriptor.name)) {
				if (openingTag) selectedIndexes.add(openingTag.index)
				selectedIndexes.add(index)
			}
			continue
		}

		if (isVoid) {
			if (dangerous) selectedIndexes.add(index)
			continue
		}

		const tagStack = openTags.get(descriptor.name) ?? []
		tagStack.push({ index, dangerous })
		openTags.set(descriptor.name, tagStack)
	}

	for (const tagStack of openTags.values()) {
		for (const openingTag of tagStack) {
			if (openingTag.dangerous) selectedIndexes.add(openingTag.index)
		}
	}

	return htmlContents.filter((_, index) => selectedIndexes.has(index))
}

function createHtmlProbe(html: string, probeIndex: number): string {
	const closingBracketIndex = html.lastIndexOf(">")
	if (closingBracketIndex === -1) return html

	const selfClosingSlashIndex = html.slice(0, closingBracketIndex).search(/\/\s*$/)
	const insertionIndex =
		selfClosingSlashIndex === -1 ? closingBracketIndex : selfClosingSlashIndex
	const probeWhitespace = `\t ${"\t ".repeat(probeIndex + 3)}`

	return `${html.slice(0, insertionIndex)}${probeWhitespace}${html.slice(insertionIndex)}`
}

function locateHtmlInlineRanges(markdown: string, tokens: MarkdownToken[]): HtmlSourceRange[] {
	const htmlContents = collectRelevantHtmlInlineContents(tokens)
	if (htmlContents.length === 0) return []

	const candidates: Array<{ start: number; end: number; probe: string; content: string }> = []
	const seenCandidates = new Set<string>()
	for (const [contentIndex, content] of htmlContents.entries()) {
		let candidateStart = markdown.indexOf(content)
		while (candidateStart !== -1) {
			const candidateEnd = candidateStart + content.length
			const key = `${candidateStart}:${candidateEnd}`
			if (!seenCandidates.has(key)) {
				const probe = createHtmlProbe(content, candidates.length + contentIndex)
				candidates.push({ start: candidateStart, end: candidateEnd, probe, content })
				seenCandidates.add(key)
			}
			candidateStart = markdown.indexOf(content, candidateStart + 1)
		}
	}

	const nonOverlappingCandidates = candidates
		.sort((left, right) => left.start - right.start || right.end - left.end)
		.filter(
			(candidate, index, sorted) => index === 0 || candidate.start >= sorted[index - 1].end,
		)
	const probedMarkdown = nonOverlappingCandidates
		.slice()
		.sort((left, right) => right.start - left.start)
		.reduce(
			(result, candidate) =>
				`${result.slice(0, candidate.start)}${candidate.probe}${result.slice(candidate.end)}`,
			markdown,
		)
	const recognizedProbes = new Set(
		collectHtmlInlineContents(markdownParser.parse(probedMarkdown, {}) as MarkdownToken[]),
	)

	return nonOverlappingCandidates
		.filter((candidate) => recognizedProbes.has(candidate.probe))
		.map(({ start, end, content }) => ({ start, end, content }))
}

function getLineOffsets(markdown: string): number[] {
	const offsets = [0]
	for (let index = 0; index < markdown.length; index += 1) {
		if (markdown[index] === "\n") offsets.push(index + 1)
	}
	offsets.push(markdown.length)
	return offsets
}

function createHtmlBlockReplacement(
	markdown: string,
	token: MarkdownToken,
	lineOffsets: number[],
): { range: SourceRange; replacement: string } | null {
	if (!token.map || !shouldRenderHtmlAsCode(token.content)) return null

	const [startLine, endLine] = token.map
	const start = lineOffsets[startLine]
	const end = lineOffsets[endLine] ?? markdown.length
	const sourceLines = markdown.slice(start, end).replace(/\n$/, "").split("\n")
	const tokenLines = token.content.replace(/\n$/, "").split("\n")
	const encodedLines = sourceLines.map((sourceLine, index) => {
		const tokenLine = tokenLines[index] ?? ""
		const contentStart = tokenLine ? sourceLine.indexOf(tokenLine) : sourceLine.length
		const prefix = contentStart >= 0 ? sourceLine.slice(0, contentStart) : ""
		const content = contentStart >= 0 ? tokenLine : sourceLine
		const opening = index === 0 ? "<pre><code>" : ""
		const closing = index === sourceLines.length - 1 ? "</code></pre>" : ""
		return `${prefix}${opening}${escapeHtml(content)}${closing}`
	})

	return {
		range: { start, end },
		replacement: `${encodedLines.join("\n")}${markdown.slice(start, end).endsWith("\n") ? "\n" : ""}`,
	}
}

function createInlineCodeRanges(ranges: HtmlSourceRange[]): SourceRange[] {
	const result: SourceRange[] = []
	const openTags = new Map<string, Array<HtmlSourceRange & { dangerous: boolean }>>()

	for (const range of ranges) {
		const descriptor = getHtmlTagDescriptor(range.content)
		if (!descriptor) continue

		const dangerous = shouldRenderHtmlAsCode(range.content)
		const isVoid = descriptor.isSelfClosing || voidHtmlTags.has(descriptor.name)

		if (descriptor.isClosing) {
			const tagStack = openTags.get(descriptor.name)
			const openingTag = tagStack?.pop()
			if (openingTag?.dangerous || protectedHtmlTags.has(descriptor.name)) {
				result.push({
					start: openingTag?.start ?? range.start,
					end: range.end,
				})
			}
			continue
		}

		if (isVoid) {
			if (dangerous) result.push(range)
			continue
		}

		const tagStack = openTags.get(descriptor.name) ?? []
		tagStack.push({ ...range, dangerous })
		openTags.set(descriptor.name, tagStack)
	}

	for (const tagStack of openTags.values()) {
		for (const openingTag of tagStack) {
			if (openingTag.dangerous) result.push(openingTag)
		}
	}

	return result
}

function mergeSourceRanges(ranges: SourceRange[]): SourceRange[] {
	const sortedRanges = [...ranges].sort((left, right) => left.start - right.start)
	const merged: SourceRange[] = []

	for (const range of sortedRanges) {
		const previous = merged[merged.length - 1]
		if (previous && range.start <= previous.end) {
			previous.end = Math.max(previous.end, range.end)
		} else {
			merged.push({ ...range })
		}
	}

	return merged
}

/**
 * Convert HTML elements that are either invisible or can execute content into
 * literal code text when a Markdown parser is configured with raw HTML support.
 *
 * The same markdown-it grammar used by the renderer identifies code blocks,
 * inline code, and raw HTML, so code samples are intentionally left untouched.
 * This is a display hardening step, not a general-purpose HTML sanitizer.
 */
export function escapeDangerousInvisibleHtmlTags(markdown: string): string {
	if (!markdown) return markdown

	const tokens = markdownParser.parse(markdown, {}) as MarkdownToken[]
	const lineOffsets = getLineOffsets(markdown)
	const replacements: Array<{ range: SourceRange; replacement: string }> = tokens
		.filter((token) => token.type === "html_block")
		.map((token) => createHtmlBlockReplacement(markdown, token, lineOffsets))
		.filter((replacement): replacement is NonNullable<typeof replacement> => !!replacement)

	const inlineRanges = createInlineCodeRanges(locateHtmlInlineRanges(markdown, tokens))
	for (const range of mergeSourceRanges(inlineRanges)) {
		replacements.push({
			range,
			replacement: `<code>${escapeHtml(markdown.slice(range.start, range.end))}</code>`,
		})
	}

	return replacements
		.sort((left, right) => right.range.start - left.range.start)
		.reduce(
			(result, { range, replacement }) =>
				`${result.slice(0, range.start)}${replacement}${result.slice(range.end)}`,
			markdown,
		)
}

/**
 * Recursively find a file in the attachment tree by file name
 * Legacy function for backward compatibility
 *
 * @param items - Array of attachment files
 * @param fileName - The file name to search for
 * @returns The matched file or null if not found
 */
export function findFileByName(
	items: Array<{
		file_id: string
		file_name: string
		is_directory?: boolean
		children?: any[]
		relative_file_path?: string
	}>,
	fileName: string,
): any | null {
	if (!Array.isArray(items) || items.length === 0) {
		return null
	}

	for (const item of items) {
		// Recursively search in directories
		if (item.is_directory && item.children) {
			const found = findFileByName(item.children, fileName)
			if (found) return found
		}
		// Check if the file name matches
		else if (item.file_name === fileName || fileName.startsWith(item.file_name)) {
			return item
		}
	}

	return null
}

/**
 * Extract file name from image URL (removing size syntax)
 *
 * @param imgUrl - Image URL with optional size syntax (e.g., "./images/file.png =300x200")
 * @returns File name without path and size syntax
 *
 * @example
 * extractFileName("./images/file.png =300x200") // returns "file.png"
 * extractFileName("../folder/photo.jpg =300x") // returns "photo.jpg"
 */
export function extractFileName(imgUrl: string): string {
	// Remove size syntax first (e.g., " =300x200")
	const urlWithoutSize = imgUrl.split(" ")[0]
	// Extract the file name from path
	const pathParts = urlWithoutSize.split("/")
	return pathParts[pathParts.length - 1]
}
