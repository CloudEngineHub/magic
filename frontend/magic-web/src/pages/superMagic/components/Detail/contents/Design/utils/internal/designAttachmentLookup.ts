/**
 * @internal
 * 仅供 `../designPath` 门面内部使用；生产业务代码请统一从 `designPath` 导入路径解析能力。
 */
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignAttachmentIndex } from "../designAttachmentIndex"

/**
 * 设计附件路径 → FileItem 解析（单一职责：仅负责「DSL path / workspace 相对路径」如何落到附件表）。
 *
 * 原则：
 * - 多候选若解析到不同 file_id，优先唯一 strict 命中；否则失败关闭，避免「串路径」误绑资源。
 * - 按 file_id 解析仅在 DSL 单段符合服务端长数字 id 形态时启用。
 */

export interface ResolvedPathCandidate {
	resolvedPath: string
	normalizedPath: string
}

export interface FileItemLookupResult extends ResolvedPathCandidate {
	fileItem: FileItem
}

export type AttachmentPathMatchKind = "strict-normalized" | "leading-slash-relaxed" | "file-id"

interface AttachmentPathMatch {
	fileItem: FileItem
	matchKind: AttachmentPathMatchKind
}

export interface CandidateMatch extends ResolvedPathCandidate {
	fileItem: FileItem
	matchKind: AttachmentPathMatchKind
}

/** 与 `utils.normalizePath` 保持一致，避免路径门面与大 utils 之间形成循环依赖。 */
function normalizePath(path: string): string {
	if (!path) return ""
	return path.replace(/^\/+|\/+$/g, "")
}

/** DSL 中单段路径仅在形似服务端长数字 file_id 时参与按 id 解析，避免短字符串误命中其它附件 */
export function isDslPathPlausibleFileIdSegment(path: string): boolean {
	const p = path.trim()
	if (!p || p.includes("/") || p.includes("\\")) return false
	return /^\d{16,}$/.test(p)
}

function resolveAttachmentForWorkspacePath(
	storeFiles: FileItem[],
	normalizedPath: string,
	dslPath: string,
	index?: DesignAttachmentIndex | null,
): AttachmentPathMatch | null {
	if (index) {
		let fileItem = index.byNormalizedPath.get(normalizedPath)
		if (fileItem?.file_id && !fileItem.is_directory) {
			return { fileItem, matchKind: "strict-normalized" }
		}

		const pathWithoutLeadingSlash = normalizedPath.startsWith("/")
			? normalizedPath.slice(1)
			: normalizedPath
		fileItem = index.byPathWithoutLeadingSlash.get(pathWithoutLeadingSlash)
		if (fileItem?.file_id && !fileItem.is_directory) {
			return { fileItem, matchKind: "leading-slash-relaxed" }
		}

		if (dslPath && isDslPathPlausibleFileIdSegment(dslPath)) {
			const id = dslPath.trim()
			fileItem = index.byFileId.get(id)
			if (fileItem?.file_id && !fileItem.is_directory) {
				return { fileItem, matchKind: "file-id" }
			}
		}
	}

	if (storeFiles.length === 0) return null

	let fileItem = storeFiles.find((item) => {
		if (!item.relative_file_path || item.is_directory) return false
		return normalizePath(item.relative_file_path) === normalizedPath
	})
	if (fileItem?.file_id) {
		return { fileItem, matchKind: "strict-normalized" }
	}

	const pathWithoutLeadingSlash = normalizedPath.startsWith("/")
		? normalizedPath.slice(1)
		: normalizedPath

	fileItem = storeFiles.find((item) => {
		if (!item.relative_file_path || item.is_directory) return false
		const itemPath = normalizePath(item.relative_file_path)
		const itemPathWithoutLeadingSlash = itemPath.startsWith("/") ? itemPath.slice(1) : itemPath
		return itemPathWithoutLeadingSlash === pathWithoutLeadingSlash
	})
	if (fileItem?.file_id) {
		return { fileItem, matchKind: "leading-slash-relaxed" }
	}

	if (dslPath && isDslPathPlausibleFileIdSegment(dslPath)) {
		const id = dslPath.trim()
		fileItem = storeFiles.find((item) => !item.is_directory && item.file_id === id)
		if (fileItem?.file_id) {
			return { fileItem, matchKind: "file-id" }
		}
	}

	return null
}

function isStrictNormalizedAttachmentMatch(
	candidate: ResolvedPathCandidate,
	fileItem: FileItem,
): boolean {
	if (!fileItem.relative_file_path) return false
	return normalizePath(fileItem.relative_file_path) === candidate.normalizedPath
}

/**
 * 已知单个 normalized workspace 路径时的附件解析（内存缓存校验等）。
 */
export function lookupAttachmentForSingleNormalizedPath(
	normalizedPath: string,
	dslPath: string,
	storeFiles: FileItem[],
	attachmentIndex?: DesignAttachmentIndex | null,
): FileItem | null {
	const match = resolveAttachmentForWorkspacePath(
		storeFiles,
		normalizedPath,
		dslPath,
		attachmentIndex,
	)
	return match?.fileItem ?? null
}

export function collectAttachmentMatchesAmongCandidates(
	candidates: ResolvedPathCandidate[],
	dslPath: string,
	storeFiles: FileItem[],
	attachmentIndex?: DesignAttachmentIndex | null,
): CandidateMatch[] {
	const matches: CandidateMatch[] = []

	for (const candidate of candidates) {
		const resolved = resolveAttachmentForWorkspacePath(
			storeFiles,
			candidate.normalizedPath,
			dslPath,
			attachmentIndex,
		)
		if (!resolved) continue
		matches.push({
			resolvedPath: candidate.resolvedPath,
			normalizedPath: candidate.normalizedPath,
			fileItem: resolved.fileItem,
			matchKind: resolved.matchKind,
		})
	}

	return matches
}

/**
 * 多候选路径下解析附件：歧义（指向不同 file_id）时返回 null，避免误绑。
 */
export function lookupAttachmentAmongCandidates(
	candidates: ResolvedPathCandidate[],
	dslPath: string,
	storeFiles: FileItem[],
	attachmentIndex?: DesignAttachmentIndex | null,
): FileItemLookupResult | null {
	const matches = collectAttachmentMatchesAmongCandidates(
		candidates,
		dslPath,
		storeFiles,
		attachmentIndex,
	)

	if (matches.length === 0) return null
	if (matches.length === 1) {
		const m = matches[0]
		return {
			resolvedPath: m.resolvedPath,
			normalizedPath: m.normalizedPath,
			fileItem: m.fileItem,
		}
	}

	const fileIds = new Set(matches.map((m) => m.fileItem.file_id))
	if (fileIds.size === 1) {
		const m = matches[0]
		return {
			resolvedPath: m.resolvedPath,
			normalizedPath: m.normalizedPath,
			fileItem: m.fileItem,
		}
	}

	const strictMatches = matches.filter((m) => isStrictNormalizedAttachmentMatch(m, m.fileItem))
	if (strictMatches.length === 1) {
		const m = strictMatches[0]
		return {
			resolvedPath: m.resolvedPath,
			normalizedPath: m.normalizedPath,
			fileItem: m.fileItem,
		}
	}

	return null
}
