import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import type { ImageProcessOptions } from "@/utils/image-processing"
import { resolveResourceUrlsWithVersionOverrides } from "../dashboard/resourceVersioning"
import {
	createPreloadedUrlMapping,
	injectMediaInterceptorScript,
	type FileItem,
} from "./mediaInterceptor"
import type { HtmlDisplayConfig, HtmlResourceInfo } from "./htmlResourceCollector"
import { resolveCachedResourceUrls } from "./resourceUrlCache"

interface ReplaceHtmlResourceUrlsOptions {
	fileIds: string[]
	resourceFileVersions?: Record<string, number | undefined>
	preloadedUrlMapping?: Map<string, string>
	imageProcessOptions?: ImageProcessOptions
	imageFileIds: Set<string>
	/** Subset of imageFileIds that may be converted to WebP (GIF is excluded). */
	imageProcessingFileIds?: Set<string>
	fileUpdatedAtMap: Map<string, string>
	htmlContent: string
	urlMap: Map<string, HtmlResourceInfo>
	filePathMap: Map<string, string>
	processingMetadata?: HtmlDisplayConfig
	allFiles: FileItem[]
	relativeFolderPath: string
}

interface ReplaceHtmlResourceUrlsResult {
	content: string
	filePathMapping: Map<string, string>
}

function escapeHtmlAttributeValue(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

async function resolveHtmlResourceUrls({
	fileIds,
	resourceFileVersions,
	preloadedUrlMapping,
	imageProcessOptions,
	imageFileIds,
	imageProcessingFileIds,
	fileUpdatedAtMap,
}: Pick<
	ReplaceHtmlResourceUrlsOptions,
	| "fileIds"
	| "resourceFileVersions"
	| "preloadedUrlMapping"
	| "imageProcessOptions"
	| "imageFileIds"
	| "imageProcessingFileIds"
	| "fileUpdatedAtMap"
>) {
	const processableImageFileIds = imageProcessingFileIds ?? imageFileIds
	return resolveResourceUrlsWithVersionOverrides({
		fileIds,
		resourceFileVersions,
		fetchUnversionedUrls: async (unversionedFileIds) => {
			if (unversionedFileIds.length === 0) return []

			if (preloadedUrlMapping) {
				const preloadedUrls = unversionedFileIds
					// Preloaded URLs are originals. Reuse them for non-images and formats
					// that must not be transformed (notably animated GIFs).
					.filter((fileId) =>
						imageProcessOptions ? !processableImageFileIds.has(fileId) : true,
					)
					.map((fileId) => ({
						file_id: fileId,
						url: preloadedUrlMapping.get(fileId),
					}))
					.filter((item) => item.url) as GetTemporaryDownloadUrlItem[]

				if (!imageProcessOptions) return preloadedUrls

				const imageIdsToProcess = unversionedFileIds.filter((fileId) =>
					processableImageFileIds.has(fileId),
				)
				const originalIdsToFetch = unversionedFileIds.filter(
					(fileId) =>
						!processableImageFileIds.has(fileId) && !preloadedUrlMapping.has(fileId),
				)
				const originalUrls =
					originalIdsToFetch.length > 0
						? await getTemporaryDownloadUrl({ file_ids: originalIdsToFetch })
						: []
				if (imageIdsToProcess.length === 0) return [...preloadedUrls, ...(originalUrls || [])]

				const processedImageUrls = await getTemporaryDownloadUrl({
					file_ids: imageIdsToProcess,
					options: { xMagicImageProcess: imageProcessOptions },
				})
				return [...preloadedUrls, ...(processedImageUrls || []), ...(originalUrls || [])]
			}

			return resolveCachedResourceUrls({
				fileIds: unversionedFileIds,
				imageFileIds: processableImageFileIds,
				fileUpdatedAtMap,
				imageProcessOptions,
			})
		},
	})
}

/** Replace collected relative resources while preserving their original paths for editing. */
export async function replaceHtmlResourceUrls({
	fileIds,
	resourceFileVersions,
	preloadedUrlMapping,
	imageProcessOptions,
	imageFileIds,
	imageProcessingFileIds,
	fileUpdatedAtMap,
	htmlContent,
	urlMap,
	filePathMap,
	processingMetadata,
	allFiles,
	relativeFolderPath,
}: ReplaceHtmlResourceUrlsOptions): Promise<ReplaceHtmlResourceUrlsResult> {
	const urlData = await resolveHtmlResourceUrls({
		fileIds,
		resourceFileVersions,
		preloadedUrlMapping,
		imageProcessOptions,
		imageFileIds,
		imageProcessingFileIds,
		fileUpdatedAtMap,
	})
	const filePathMapping = new Map<string, string>()
	const magicProjectConfig: Record<string, unknown> = {}
	let content = htmlContent

	urlData.forEach((item) => {
		const resourceInfo = urlMap.get(item.file_id)
		filePathMapping.set(item.url || "", filePathMap.get(item.file_id) || "")
		if (!resourceInfo || !item.url) return

		urlMap.set(item.file_id, { ...resourceInfo, url: item.url })
		const escapedPath = resourceInfo.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

		if (resourceInfo.attr === "slides") return

		if (resourceInfo.attr === "data-analyst-dashboard") {
			const urlRegex = new RegExp(`(url\\s*:\\s*)(['"\`])${escapedPath}(['"\`])`, "g")
			content = content.replace(urlRegex, `$1$2${item.url}$3`)
			return
		}

		if (resourceInfo.attr === "data-analyst-project") {
			const configKey = resourceInfo.type === "geo" ? "geo" : "dataSources"
			if (resourceInfo.type === "geo" || resourceInfo.type === "cleaned_data") {
				const configItems =
					(magicProjectConfig[configKey] as
						| Array<{ name: string; url: string }>
						| undefined) ?? []
				configItems.push({
					name: resourceInfo.fileName?.split(".")[0] ?? "",
					url: item.url,
				})
				magicProjectConfig[configKey] = configItems
			}
			return
		}

		if (resourceInfo.attr === "css-url") {
			const cssUrlRegex = new RegExp(`url\\(\\s*['"]?${escapedPath}['"]?\\s*\\)`, "g")
			content = content.replace(
				cssUrlRegex,
				`/*__ORIGINAL_URL__:${resourceInfo.path}__*/url('${item.url}')`,
			)
			return
		}

		if (resourceInfo.attr === "inline-style") {
			const inlineStyleRegex = new RegExp(
				`(<${resourceInfo.tag}[^>]*?style=["'])([^"']*?url\\(\\s*['"]?${escapedPath}['"]?\\s*\\)[^"']*?)(["'][^>]*?>)`,
				"gi",
			)
			content = content.replace(
				inlineStyleRegex,
				(match, beforeStyle, styleContent, afterStyle) => {
					const replacedStyleContent = styleContent.replace(
						new RegExp(`url\\(\\s*['"]?${escapedPath}['"]?\\s*\\)`, "g"),
						`/*__ORIGINAL_URL__:${resourceInfo.path}__*/url('${item.url}')`,
					)
					return `${beforeStyle}${replacedStyleContent}${afterStyle}`
				},
			)
			return
		}

		const attributeRegex = new RegExp(
			`<(${resourceInfo.tag})([^>]*?)${resourceInfo.attr}=["']${escapedPath}["']([^>]*?)>`,
			"gi",
		)
		content = content.replace(attributeRegex, (match, tagName, beforeAttr, afterAttr) => {
			const escapedUrl = escapeHtmlAttributeValue(item.url)
			const escapedOriginalPath = escapeHtmlAttributeValue(resourceInfo.path)
			return `<${tagName}${beforeAttr}${resourceInfo.attr}="${escapedUrl}" data-original-path="${escapedOriginalPath}"${afterAttr}>`
		})
	})

	if (processingMetadata?.type === "dashboard" && Object.keys(magicProjectConfig).length > 0) {
		const splitContent = content.split("</head>")
		content = `
			${splitContent[0]}
			<script data-injected="true">
				if (window.magicProjectConfigure) {
					window.magicProjectConfigure(${JSON.stringify(magicProjectConfig)});
				}
			</script>
			</head>
			${splitContent[1]}
		`
	}

	if (processingMetadata?.type === "audio" || processingMetadata?.type === "video") {
		const mapping = createPreloadedUrlMapping(allFiles, urlMap, relativeFolderPath)
		content = injectMediaInterceptorScript(content, {
			enableRelativePathInterception: true,
			preloadedUrlMapping: mapping,
		})
	}

	return { content, filePathMapping }
}
