import { resolveSingleDocumentStaticDependencies } from "@/pages/superMagic/utils/staticDependencies"
import type { StaticDependencyAttachment } from "@/pages/superMagic/utils/staticDependencies"

interface ResolveShareDocumentDependenciesInput {
	/** IDs selected by the user; only supported document types are analyzed. */
	selectedFileIds: string[]
	/** Full attachment snapshot used to resolve local references. */
	attachments: StaticDependencyAttachment[]
	/** Optional bundle root used to prevent cross-recording matches. */
	bundleRootPath?: string
}

interface ResolveShareDocumentDependenciesResult {
	dependencyFileIds: string[]
	missingResourcePaths: string[]
}

/**
 * Resolves dependencies for every selected Markdown/HTML document while keeping one bad file
 * from preventing the remaining documents from contributing resources to the share.
 */
export async function resolveShareDocumentDependencies({
	selectedFileIds,
	attachments,
	bundleRootPath,
}: ResolveShareDocumentDependenciesInput): Promise<ResolveShareDocumentDependenciesResult> {
	const scopedAttachments = scopeAttachmentsToBundle(attachments, bundleRootPath)
	const scopedIds = new Set(scopedAttachments.map((file) => file.file_id).filter(Boolean))
	const documentIds = selectedFileIds.filter((fileId) => scopedIds.has(fileId))

	const results = await Promise.all(
		documentIds.map(async (fileId) => {
			try {
				return await resolveSingleDocumentStaticDependencies({
					fileIds: [fileId],
					attachments: scopedAttachments,
				})
			} catch (error) {
				console.warn("Failed to resolve share document dependencies", { fileId, error })
				return null
			}
		}),
	)

	const dependencyFileIds = new Set<string>()
	const missingResourcePaths = new Set<string>()
	for (const result of results) {
		if (!result) continue
		result.dependencyFileIds.forEach((fileId) => dependencyFileIds.add(fileId))
		result.missingResourcePaths.forEach((path) => missingResourcePaths.add(path))
	}

	return {
		dependencyFileIds: [...dependencyFileIds],
		missingResourcePaths: [...missingResourcePaths],
	}
}

/** Filters a flat or nested attachment snapshot to one recording bundle. */
function scopeAttachmentsToBundle(
	attachments: StaticDependencyAttachment[],
	bundleRootPath?: string,
): StaticDependencyAttachment[] {
	const normalizedRoot = normalizePath(bundleRootPath)
	if (!normalizedRoot) return attachments

	const scoped = attachments.filter((file) =>
		getPathCandidates(file).some((path) => {
			const normalizedPath = normalizePath(path)
			return (
				normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
			)
		}),
	)

	return scoped
}

/** Returns every path field that may identify an attachment in API responses. */
function getPathCandidates(file: StaticDependencyAttachment): string[] {
	return [
		file.relative_file_path,
		file.path,
		file.file_key,
		file.file_name,
		file.filename,
	].filter((path): path is string => Boolean(path))
}

/** Normalizes encoded and platform-specific paths for bundle boundary checks. */
function normalizePath(path?: string): string {
	if (!path) return ""
	try {
		return decodeURIComponent(path)
			.trim()
			.toLowerCase()
			.replace(/\\/g, "/")
			.replace(/^\/+|\/+$/g, "")
	} catch {
		return path
			.trim()
			.toLowerCase()
			.replace(/\\/g, "/")
			.replace(/^\/+|\/+$/g, "")
	}
}
