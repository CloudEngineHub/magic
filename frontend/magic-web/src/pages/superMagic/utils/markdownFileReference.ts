import { env } from "@/utils/env"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

const WORKSPACE_ROOT_PREFIX = ".workspace/"
const MAGIC_ROOT_PREFIX = ".magic/"
const DEFAULT_REFERENCED_PROJECT_MOUNT_BASE_PATH = "/mnt/agfs/magicfs/referenced-projects"

export type MarkdownFileTarget =
	| { scope: "workspace"; relativePath: string }
	| { scope: "referenced-project"; projectId: string; relativePath: string }

export interface MarkdownFileHrefClassification {
	target: MarkdownFileTarget | null
	explicitFileReference: boolean
}

interface MarkdownFileHrefOptions {
	/** 已有工作区图片资源接受 /图片.png；普通网页链接不启用此语义。 */
	allowWorkspaceRoot?: boolean
}

function decodeURIComponentOnce(value: string): string | null {
	try {
		return decodeURIComponent(value)
	} catch {
		return null
	}
}

function hasControlCharacters(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0)
		if (code < 32 || code === 127) return true
	}
	return false
}

function normalizeWorkspacePathSegments(path: string): string | null {
	const normalizedSlashes = path.replace(/\\/g, "/")
	if (!normalizedSlashes || normalizedSlashes.startsWith("/")) return null

	const segments: string[] = []
	for (const segment of normalizedSlashes.split("/")) {
		if (!segment || segment === ".") continue
		if (segment.includes("\0")) return null
		if (segment === "..") {
			if (segments.length === 0) return null
			segments.pop()
		} else {
			segments.push(segment)
		}
	}
	return segments.length > 0 ? segments.join("/") : null
}

function normalizeReferencedProjectMountBasePath(path: string): string | null {
	const normalized = path.trim().replace(/\\/g, "/").replace(/\/+$/g, "")
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

	// 业务路径不是 URL；百分号和 HTML 实体可能就是文件名，不能在这里解码。
	const normalized = path.trim().replace(/\\/g, "/")
	if (normalized.startsWith("/")) return null
	const withoutPrefix = normalized.replace(/^(?:\.\/+)+/, "")
	const withoutWorkspaceRoot = withoutPrefix.startsWith(WORKSPACE_ROOT_PREFIX)
		? withoutPrefix.slice(WORKSPACE_ROOT_PREFIX.length).replace(/^\/+/, "")
		: withoutPrefix
	if (!withoutWorkspaceRoot || /^[a-z][a-z\d+.-]*:/i.test(withoutWorkspaceRoot)) return null
	return normalizeWorkspacePathSegments(withoutWorkspaceRoot)
}

/** 兼容附件树中以 / 表示工作区根的历史路径，只用于内部精确比较。 */
export function normalizeWorkspacePathForComparison(path: string): string | null {
	if (!path) return null

	const normalized = path.trim()
	if (normalized.startsWith("//")) return null
	const withoutRootPrefix = normalized.startsWith("/") ? normalized.slice(1) : normalized
	return normalizeWorkspaceRelativePath(withoutRootPrefix)
}

/** 只在 href 边界解码；调用方应传 Markdown 解析后的目标或 DOM 原始 href 属性。 */
export function classifyMarkdownFileHref(
	href: string,
	options: MarkdownFileHrefOptions = {},
): MarkdownFileHrefClassification {
	const notFile: MarkdownFileHrefClassification = {
		target: null,
		explicitFileReference: false,
	}
	const rawHref = href.trim()
	if (
		!rawHref ||
		/^[a-z][a-z\d+.-]*:/i.test(rawHref) ||
		rawHref.startsWith("//") ||
		rawHref.includes("#") ||
		rawHref.includes("?") ||
		hasControlCharacters(rawHref)
	)
		return notFile

	const decodedHref = decodeURIComponentOnce(rawHref)
	if (decodedHref === null || hasControlCharacters(decodedHref)) return notFile

	if (rawHref.startsWith("/")) {
		// 绝对地址只接受 Agent 已有挂载；项目 ID 不能被编码的分隔符重新切分。
		if (rawHref.includes("\\") || /%(?:2f|5c)/i.test(rawHref)) return notFile
		const mountPrefix = getReferencedProjectMountBasePath() + "/"
		if (!decodedHref.startsWith(mountPrefix)) {
			const relativePath = options.allowWorkspaceRoot
				? normalizeWorkspaceRelativePath(decodedHref.slice(1))
				: null
			return relativePath
				? { target: { scope: "workspace", relativePath }, explicitFileReference: true }
				: notFile
		}
		const mountedPath = decodedHref.slice(mountPrefix.length)
		const separatorIndex = mountedPath.indexOf("/")
		if (separatorIndex <= 0) return notFile
		const projectId = mountedPath.slice(0, separatorIndex)
		if (projectId === "." || projectId === "..") return notFile
		const relativePath = normalizeWorkspacePathSegments(mountedPath.slice(separatorIndex + 1))
		if (!relativePath) return notFile
		return {
			target: { scope: "referenced-project", projectId, relativePath },
			explicitFileReference: true,
		}
	}

	const relativePath = normalizeWorkspaceRelativePath(decodedHref)
	if (!relativePath) return notFile
	return {
		target: { scope: "workspace", relativePath },
		explicitFileReference:
			rawHref.startsWith("./") ||
			rawHref.startsWith(WORKSPACE_ROOT_PREFIX) ||
			rawHref.startsWith(MAGIC_ROOT_PREFIX),
	}
}

export function parseMarkdownFileHref(href: string): MarkdownFileTarget | null {
	return classifyMarkdownFileHref(href).target
}

/** 接受自然相对链接及历史工作区入口，返回已经解码的实际路径。 */
export function parseCanonicalWorkspaceHref(
	href: string,
	options: MarkdownFileHrefOptions = {},
): string | null {
	const { target } = classifyMarkdownFileHref(href, options)
	return target?.scope === "workspace" ? target.relativePath : null
}

export function parseReferencedProjectHref(
	href: string,
): Extract<MarkdownFileTarget, { scope: "referenced-project" }> | null {
	const target = parseMarkdownFileHref(href)
	return target?.scope === "referenced-project" ? target : null
}

export function isWorkspaceHrefCandidate(href: string): boolean {
	const result = classifyMarkdownFileHref(href)
	return result.explicitFileReference && result.target?.scope === "workspace"
}

export function isReferencedProjectHrefCandidate(href: string): boolean {
	return classifyMarkdownFileHref(href).target?.scope === "referenced-project"
}

export function isMarkdownFileHrefCandidate(href: string): boolean {
	return classifyMarkdownFileHref(href).explicitFileReference
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

// 此入口只匹配实际路径；href 必须先由公共解析器处理，不能在查找时再次解码。
/**
 * 根据相对路径从附件列表中查找文件
 * @param attachments - 附件列表
 * @param relativePath - 相对路径 (例如: "./images/photo.png" 或 "/path/to/file.png")
 * @returns 找到的文件信息或 undefined
 */
export function findAttachmentByPath(
	attachments: AttachmentItem[],
	relativePath: string,
): AttachmentItem | undefined {
	if (!Array.isArray(attachments) || attachments.length === 0) {
		return undefined
	}

	const normalizedSearchPath = normalizeWorkspacePathForComparison(relativePath)
	if (!normalizedSearchPath) return undefined

	return findAttachmentByNormalizedPath(attachments, normalizedSearchPath)
}

function findAttachmentByNormalizedPath(
	attachments: AttachmentItem[],
	normalizedSearchPath: string,
): AttachmentItem | undefined {
	for (const item of attachments) {
		// 递归搜索子节点
		if (item.children) {
			const found = findAttachmentByNormalizedPath(item.children, normalizedSearchPath)
			if (found) return found
		}

		// 检查 relative_file_path 是否匹配
		if (item.relative_file_path) {
			const normalizedItemPath = normalizeWorkspacePathForComparison(item.relative_file_path)
			if (normalizedItemPath === normalizedSearchPath) {
				return item
			}
		}

		// 也检查 path 字段作为备选
		if (item.path) {
			const normalizedItemPath = normalizeWorkspacePathForComparison(item.path)
			if (normalizedItemPath === normalizedSearchPath) {
				return item
			}
		}
	}

	return undefined
}

/** 旧 file_path 优先按原始文件名匹配，只有未命中时才兼容一次 href 解码。 */
export function findLegacyAttachmentByPath(
	attachments: AttachmentItem[],
	path: string,
): AttachmentItem | undefined {
	const file = findAttachmentByPath(attachments, path)
	if (file) return file
	const decodedPath = parseCanonicalWorkspaceHref(path)
	return decodedPath && decodedPath !== path
		? findAttachmentByPath(attachments, decodedPath)
		: undefined
}
