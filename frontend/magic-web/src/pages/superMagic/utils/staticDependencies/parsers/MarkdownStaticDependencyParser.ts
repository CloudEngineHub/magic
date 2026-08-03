import {
	extractImagePaths,
	findFileByPath,
	isExternalUrl,
	normalizeImagePath,
	resolveRelativePath,
} from "@/pages/superMagic/utils/image-url-resolver"
import { BaseStaticDependencyParser } from "../BaseStaticDependencyParser"
import { getStaticDependencyDirectoryPath, getStaticDependencyFileExtension } from "../pathUtils"
import type { StaticDependencyAttachment, StaticDependencyResolveContext } from "../types"

/**
 * Extracts local resources from Markdown syntax and embedded media tags.
 * @example `![cover](./cover.png)` -> `["./cover.png"]`
 */
function extractMarkdownResourcePaths(content: string): string[] {
	const resourcePaths = [...extractImagePaths(content)]
	const htmlResourceRegex =
		/<(?:video|audio|source|script|link)\b[^>]*?\b(?:src|poster|href)=["']([^"']+)["'][^>]*>/gi

	for (const match of content.matchAll(htmlResourceRegex)) {
		const resourcePath = match[1]?.trim()
		if (
			resourcePath &&
			!isExternalUrl(resourcePath) &&
			!resourcePath.startsWith("blob:") &&
			!resourcePath.startsWith("mailto:") &&
			!resourcePath.startsWith("#")
		) {
			resourcePaths.push(resourcePath)
		}
	}

	return [...new Set(resourcePaths)]
}

export class MarkdownStaticDependencyParser extends BaseStaticDependencyParser {
	protected readonly fileType = "markdown" as const

	supports(file: StaticDependencyAttachment): boolean {
		return (
			!file.is_directory &&
			["md", "markdown"].includes(getStaticDependencyFileExtension(file))
		)
	}

	protected collectDependencies(context: StaticDependencyResolveContext) {
		const documentDirectory = getStaticDependencyDirectoryPath(
			context.file.relative_file_path,
		).replace(/\/$/, "")
		const dependencyFileIds: string[] = []
		const missingResourcePaths: string[] = []

		for (const resourcePath of extractMarkdownResourcePaths(context.content)) {
			const normalizedPath = normalizeImagePath(resourcePath)
			const resolvedPath = documentDirectory
				? resolveRelativePath(documentDirectory, normalizedPath)
				: normalizedPath
			const matchedFile = findFileByPath(context.attachments, resolvedPath)

			if (matchedFile?.file_id) dependencyFileIds.push(matchedFile.file_id)
			else missingResourcePaths.push(resourcePath)
		}

		return { dependencyFileIds, missingResourcePaths }
	}
}
