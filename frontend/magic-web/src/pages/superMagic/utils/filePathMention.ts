import { env } from "@/utils/env"

export const FILE_PATH_MENTION_PREFIX = "[@file_path:"
const WORKSPACE_ROOT_PREFIX = ".workspace/"
const MAGIC_ROOT_PREFIX = ".magic/"
const DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH = "/mnt/agfs/magicfs/referenced-projects"

export interface FilePathMentionMatch {
	path: string
	startIndex: number
	endIndex: number
	fullMatch: string
}

export interface WorkspaceMarkdownLinkMatch extends FilePathMentionMatch {
	label: string
	href: string
}

export interface WorkspaceFileReferenceMatch extends FilePathMentionMatch {
	source: "markdown" | "legacy"
	label?: string
	href?: string
}

export type MarkdownFileTarget =
	| { scope: "workspace"; relativePath: string }
	| { scope: "referenced-project"; projectId: string; relativePath: string }

export interface MarkdownFileLinkMatch extends FilePathMentionMatch {
	label: string
	href: string
	target: MarkdownFileTarget
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#(?:39|x27);/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
}

function decodeURIComponentOnce(value: string): string | null {
	try {
		return decodeURIComponent(value)
	} catch {
		return null
	}
}

function normalizeWorkspacePathSegments(path: string): string | null {
	const normalizedSlashes = path.replace(/\\/g, "/")
	if (!normalizedSlashes || normalizedSlashes.startsWith("/")) return null

	const segments: string[] = []
	for (const segment of normalizedSlashes.split("/")) {
		if (!segment || segment === ".") continue
		if (segment === ".." || segment.includes("\0")) return null
		segments.push(segment)
	}

	return segments.length > 0 ? segments.join("/") : null
}

function normalizeReferencedProjectMountBasePath(path: string): string | null {
	const normalized = decodeHtmlEntities(path.trim()).replace(/\\/g, "/").replace(/\/+$/g, "")
	if (
		!normalized.startsWith("/") ||
		normalized.startsWith("//") ||
		normalized.includes("\0") ||
		normalized.includes("?") ||
		normalized.includes("#") ||
		normalized.split("/").some((segment) => segment === "." || segment === "..")
	) {
		return null
	}

	return normalized
}

/** 获取与 Agent 跨项目挂载一致的前端运行时路径。 */
export function getReferencedProjectMountBasePath(): string {
	const configuredPath = normalizeReferencedProjectMountBasePath(
		env("AGENT_REFERENCED_PROJECT_MOUNT_BASE_PATH", true) || "",
	)
	return configuredPath ?? DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH
}

/** 将内部工作区相对路径规范化为不带 ./ 的比较形式。 */
export function normalizeWorkspaceRelativePath(path: string): string | null {
	if (!path) return null

	const normalized = decodeHtmlEntities(path.trim())
	const withoutPrefix = normalized.startsWith("./") ? normalized.slice(2) : normalized
	const withoutWorkspaceRoot = withoutPrefix.startsWith(WORKSPACE_ROOT_PREFIX)
		? withoutPrefix.slice(WORKSPACE_ROOT_PREFIX.length)
		: withoutPrefix
	if (
		!withoutWorkspaceRoot ||
		/^[a-z][a-z\d+.-]*:/i.test(withoutWorkspaceRoot) ||
		withoutWorkspaceRoot.startsWith("//")
	) {
		return null
	}

	return normalizeWorkspacePathSegments(withoutWorkspaceRoot)
}

/** 兼容附件树中以 / 表示工作区根的历史路径，只用于内部精确比较。 */
export function normalizeWorkspacePathForComparison(path: string): string | null {
	if (!path) return null

	const normalized = decodeHtmlEntities(path.trim())
	if (normalized.startsWith("//")) return null

	const withoutRootPrefix = normalized.startsWith("/") ? normalized.slice(1) : normalized
	return normalizeWorkspaceRelativePath(withoutRootPrefix)
}

/** 接受规范的 ./ 工作区链接及历史 .workspace/.magic 入口，并且只做一次 URI 解码。 */
export function parseCanonicalWorkspaceHref(href: string): string | null {
	if (!href) return null

	const rawHref = decodeHtmlEntities(href.trim())
	const isCanonicalHref = rawHref.startsWith("./")
	const isWorkspaceRootPrefixedHref =
		rawHref.startsWith(WORKSPACE_ROOT_PREFIX) ||
		rawHref.startsWith(`./${WORKSPACE_ROOT_PREFIX}`)
	const isBareMagicHref = rawHref.startsWith(MAGIC_ROOT_PREFIX)
	if (
		(!isCanonicalHref && !isWorkspaceRootPrefixedHref && !isBareMagicHref) ||
		rawHref.includes("#") ||
		rawHref.includes("?")
	) {
		return null
	}

	const decoded = decodeURIComponentOnce(rawHref)
	if (decoded === null) return null
	if (isCanonicalHref && !decoded.startsWith("./")) return null
	if (
		!isCanonicalHref &&
		!decoded.startsWith(WORKSPACE_ROOT_PREFIX) &&
		!decoded.startsWith(MAGIC_ROOT_PREFIX)
	)
		return null

	return normalizeWorkspaceRelativePath(isCanonicalHref ? decoded.slice(2) : decoded)
}

export function isWorkspaceHrefCandidate(href: string): boolean {
	const normalizedHref = decodeHtmlEntities(href.trim())
	return (
		normalizedHref.startsWith("./") ||
		normalizedHref.startsWith(WORKSPACE_ROOT_PREFIX) ||
		normalizedHref.startsWith(MAGIC_ROOT_PREFIX)
	)
}

function encodePathSegment(segment: string): string {
	return segment.replace(/[#?%<>]/g, (char) => {
		const encoded: Record<string, string> = {
			"#": "%23",
			"?": "%3F",
			"%": "%25",
			"<": "%3C",
			">": "%3E",
		}
		return encoded[char]
	})
}

export function createCanonicalWorkspaceHref(path: string): string | null {
	const normalizedPath = normalizeWorkspaceRelativePath(path)
	if (!normalizedPath) return null

	return `./${normalizedPath.split("/").map(encodePathSegment).join("/")}`
}

export function createReferencedProjectHref(
	projectId: string,
	relativePath: string,
): string | null {
	const normalizedProjectId = projectId.trim()
	if (
		!normalizedProjectId ||
		normalizedProjectId === "." ||
		normalizedProjectId === ".." ||
		/[\\/\0]/.test(normalizedProjectId)
	) {
		return null
	}

	const normalizedRelativePath = normalizeWorkspaceRelativePath(relativePath)
	if (!normalizedRelativePath) return null

	const encodedBasePath = getReferencedProjectMountBasePath()
		.split("/")
		.map(encodePathSegment)
		.join("/")
	const encodedProjectId = encodePathSegment(normalizedProjectId)
	const encodedRelativePath = normalizedRelativePath.split("/").map(encodePathSegment).join("/")
	return `${encodedBasePath}/${encodedProjectId}/${encodedRelativePath}`
}

export function parseReferencedProjectHref(
	href: string,
): Extract<MarkdownFileTarget, { scope: "referenced-project" }> | null {
	if (!href) return null

	const rawHref = decodeHtmlEntities(href.trim())
	if (
		!rawHref.startsWith("/") ||
		rawHref.startsWith("//") ||
		rawHref.includes("?") ||
		rawHref.includes("#") ||
		rawHref.includes("\\") ||
		/%(?:2f|5c)/i.test(rawHref)
	) {
		return null
	}

	const decodedHref = decodeURIComponentOnce(rawHref)
	if (decodedHref === null) return null

	const pathPrefix = `${getReferencedProjectMountBasePath()}/`
	if (!decodedHref.startsWith(pathPrefix)) return null

	const mountedPath = decodedHref.slice(pathPrefix.length)
	const separatorIndex = mountedPath.indexOf("/")
	if (separatorIndex <= 0) return null

	const projectId = mountedPath.slice(0, separatorIndex)
	if (projectId === "." || projectId === ".." || projectId.includes("\0")) return null

	const relativePath = normalizeWorkspacePathSegments(mountedPath.slice(separatorIndex + 1))
	if (!relativePath) return null

	return { scope: "referenced-project", projectId, relativePath }
}

export function parseMarkdownFileHref(href: string): MarkdownFileTarget | null {
	const workspacePath = parseCanonicalWorkspaceHref(href)
	if (workspacePath) return { scope: "workspace", relativePath: workspacePath }

	return parseReferencedProjectHref(href)
}

export function isReferencedProjectHrefCandidate(href: string): boolean {
	const rawHref = decodeHtmlEntities(href.trim())
	const decodedHref = decodeURIComponentOnce(rawHref)
	return decodedHref?.startsWith(`${getReferencedProjectMountBasePath()}/`) ?? false
}

export function isMarkdownFileHrefCandidate(href: string): boolean {
	return isWorkspaceHrefCandidate(href) || isReferencedProjectHrefCandidate(href)
}

export function escapeMarkdownLinkLabel(label: string): string {
	return label
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[\\[\]]/g, "\\$&")
}

export function escapeHtmlText(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		const entities: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		}
		return entities[char]
	})
}

function unescapeMarkdownText(value: string): string {
	return value.replace(/\\([\\[\]()])/g, "$1")
}

interface MarkdownLinkSyntaxMatch {
	label: string
	href: string
	startIndex: number
	endIndex: number
	fullMatch: string
}

function parseMarkdownLinkSyntaxAt(
	content: string,
	startIndex: number,
): MarkdownLinkSyntaxMatch | null {
	if (content[startIndex] !== "[" || content[startIndex - 1] === "!") return null

	let index = startIndex + 1
	let labelEnd = -1
	while (index < content.length) {
		if (content[index] === "\\") {
			index += 2
			continue
		}
		if (content[index] === "]") {
			labelEnd = index
			break
		}
		index++
	}
	if (labelEnd === -1 || content[labelEnd + 1] !== "(") return null

	index = labelEnd + 2
	let href = ""
	if (content[index] === "<") {
		const hrefStart = ++index
		while (index < content.length && content[index] !== ">") index++
		if (content[index] !== ">") return null
		href = content.slice(hrefStart, index)
		index++
		while (content[index] === " " || content[index] === "\t") index++
		if (content[index] !== ")") return null
	} else {
		const hrefStart = index
		while (index < content.length) {
			if (content[index] === "\\") {
				index += 2
				continue
			}
			if (content[index] === ")") break
			index++
		}
		if (content[index] !== ")") return null
		href = content.slice(hrefStart, index).trim()
	}

	const endIndex = index + 1
	return {
		label: unescapeMarkdownText(content.slice(startIndex + 1, labelEnd)),
		href: unescapeMarkdownText(href),
		startIndex,
		endIndex,
		fullMatch: content.slice(startIndex, endIndex),
	}
}

function parseWorkspaceMarkdownLinkAt(
	content: string,
	startIndex: number,
): WorkspaceMarkdownLinkMatch | null {
	const syntax = parseMarkdownLinkSyntaxAt(content, startIndex)
	if (!syntax) return null

	const path = parseCanonicalWorkspaceHref(syntax.href)
	return path ? { ...syntax, path } : null
}

function parseMarkdownFileLinkAt(
	content: string,
	startIndex: number,
): MarkdownFileLinkMatch | null {
	const syntax = parseMarkdownLinkSyntaxAt(content, startIndex)
	if (!syntax) return null

	const target = parseMarkdownFileHref(syntax.href)
	return target ? { ...syntax, path: target.relativePath, target } : null
}

function readFenceMarker(
	content: string,
	index: number,
): { marker: string; endIndex: number } | null {
	const lineStart = index === 0 || content[index - 1] === "\n"
	if (!lineStart) return null

	let cursor = index
	let leadingSpaces = 0
	while (content[cursor] === " " && leadingSpaces < 3) {
		cursor++
		leadingSpaces++
	}

	const markerChar = content[cursor]
	if (markerChar !== "`" && markerChar !== "~") return null

	let markerEnd = cursor
	while (content[markerEnd] === markerChar) markerEnd++
	if (markerEnd - cursor < 3) return null

	return { marker: content.slice(cursor, markerEnd), endIndex: markerEnd }
}

function extractMarkdownLinks<T extends FilePathMentionMatch>(
	content: string,
	parseLinkAt: (content: string, startIndex: number) => T | null,
): T[] {
	if (!content.includes("](")) return []

	const matches: T[] = []
	let index = 0
	let fenceMarker = ""

	while (index < content.length) {
		const fence = readFenceMarker(content, index)
		if (fence && (!fenceMarker || fence.marker[0] === fenceMarker[0])) {
			if (!fenceMarker) {
				fenceMarker = fence.marker
			} else if (fence.marker.length >= fenceMarker.length) {
				fenceMarker = ""
			}
			index = fence.endIndex
			continue
		}

		if (fenceMarker) {
			index++
			continue
		}

		if (content[index] === "`") {
			let runEnd = index
			while (content[runEnd] === "`") runEnd++
			const marker = content.slice(index, runEnd)
			const closeIndex = content.indexOf(marker, runEnd)
			index = closeIndex === -1 ? runEnd : closeIndex + marker.length
			continue
		}

		if (content[index] === "[") {
			const match = parseLinkAt(content, index)
			if (match) {
				matches.push(match)
				index = match.endIndex
				continue
			}
		}

		index++
	}

	return matches
}

export function extractWorkspaceMarkdownLinks(content: string): WorkspaceMarkdownLinkMatch[] {
	return extractMarkdownLinks(content, parseWorkspaceMarkdownLinkAt)
}

export function extractMarkdownFileLinks(content: string): MarkdownFileLinkMatch[] {
	return extractMarkdownLinks(content, parseMarkdownFileLinkAt)
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

export function extractWorkspaceFileReferences(content: string): WorkspaceFileReferenceMatch[] {
	const markdownMatches: WorkspaceFileReferenceMatch[] = extractWorkspaceMarkdownLinks(
		content,
	).map((match) => ({ ...match, source: "markdown" }))
	const legacyMatches: WorkspaceFileReferenceMatch[] = extractFilePathMentions(content).map(
		(match) => ({ ...match, source: "legacy" }),
	)

	return [...markdownMatches, ...legacyMatches].sort(
		(first, second) => first.startIndex - second.startIndex,
	)
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

export function replaceFilePathMentionsOutsideFencedCode(
	content: string,
	replacer: (path: string, match: FilePathMentionMatch) => string,
): string {
	const lines = content.split(/(\r?\n)/)
	let fenceCharacter: "`" | "~" | null = null
	let fenceLength = 0
	let outsideBuffer = ""
	let result = ""

	const flushOutsideBuffer = () => {
		if (!outsideBuffer) return
		result += replaceFilePathMentions(outsideBuffer, replacer)
		outsideBuffer = ""
	}

	for (const line of lines) {
		const fenceMatch = line.match(/^(?: {0,3})(`{3,}|~{3,})/)
		if (fenceMatch) {
			flushOutsideBuffer()
			const marker = fenceMatch[1]
			const markerCharacter = marker[0] as "`" | "~"
			if (!fenceCharacter) {
				fenceCharacter = markerCharacter
				fenceLength = marker.length
			} else if (markerCharacter === fenceCharacter && marker.length >= fenceLength) {
				fenceCharacter = null
				fenceLength = 0
			}
			result += line
			continue
		}

		if (fenceCharacter) {
			result += line
		} else {
			outsideBuffer += line
		}
	}

	flushOutsideBuffer()
	return result
}
