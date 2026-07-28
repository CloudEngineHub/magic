import type { ImageProcessOptions } from "@/utils/image-processing"
import {
	extractSlidesFromScript,
	flattenAttachments,
	handleHtCdnUrl,
	removeRootHtmlXhtmlNamespace,
} from "./utils"
import { injectAtPolyfillScript } from "./utils/polyfill"
import {
	applyDashboardBundledShellToHtml,
	getBundledTemplateHtmlByKind,
	omitDashboardShellFromFetchPlan,
	type HtmlPreviewBundledTemplateKind,
} from "./html-preview-bundled-shell"
import { parseMagicProjectJsContent } from "./utils/magicProjectParser"
import { collectHtmlResourcePlan } from "./utils/htmlResourceCollector"
import { replaceHtmlResourceUrls } from "./utils/htmlResourceReplacement"

export type { HtmlPreviewBundledTemplateKind }

function mergePreviewBundledMetadata(
	base: any,
	kind: HtmlPreviewBundledTemplateKind | undefined,
): any {
	if (!kind) return base
	if (kind === "dashboard") {
		return base?.type === "dashboard" ? base : { ...base, type: "dashboard" }
	}
	if (kind === "audio") {
		return base?.type === "audio" ? base : { ...base, type: "audio" }
	}
	return base?.type === "video" ? base : { ...base, type: "video" }
}

/**
 * HTML内容处理器 - 可复用的HTML处理逻辑
 *
 * @example
 * ```typescript
 * // 基本用法
 * const result = await processHtmlContent({
 *   content: htmlString,
 *   attachments: fileAttachments,
 *   fileId: 'file123',
 *   fileName: 'example.html',
 *   attachmentList: allAttachments
 * })
 *
 * // 使用结果
 * console.log(result.processedContent) // 处理后的HTML内容
 * console.log(result.processedSlides) // 提取的幻灯片数组
 * console.log(result.hasSlides) // 是否包含幻灯片
 * console.log(result.fileUrlMapping) // 文件URL映射
 * console.log(result.slidesFileIds) // 幻灯片文件ID数组
 * ```
 */

/**
 * 将 window.location.reload 替换为 window.Magic.reload
 * @param htmlContent - HTML 内容字符串
 * @returns 处理后的 HTML 内容
 */
function replaceLocationReload(htmlContent: string): string {
	// 匹配 window.location.reload() 的各种写法
	// 包括：window.location.reload()、window.location.reload(true)、window.location.reload(false)
	// 以及可能的空格变体
	return htmlContent.replace(
		/window\.location\.reload\s*\(\s*(?:true|false)?\s*\)/gi,
		(match) => {
			// 保存原始代码到注释中，以便保存时恢复
			return `/*__ORIGINAL_RELOAD__:${match}__*/window.Magic.reload()`
		},
	)
}

function restoreSerializedEntities(html: string): string {
	/** 匹配 HTML 实体（命名或数字），用 DOM 解码，不维护映射表且支持 &#123; / &#x7B; */
	const ENTITY_PATTERN = /&(?:[a-z0-9]+|#\d+|#x[0-9a-f]+);/gi
	const el = document.createElement("div")
	return html.replace(ENTITY_PATTERN, (entity) => {
		el.innerHTML = entity
		return el.textContent ?? entity
	})
}

/** 将 Document 序列化为 HTML 字符串并还原实体，保证输出格式与 DOM 语义一致 */
function serializeDocToHtml(doc: Document): string {
	return removeRootHtmlXhtmlNamespace(
		restoreSerializedEntities(new XMLSerializer().serializeToString(doc)),
	)
}

function finalizeHtmlPreviewBundledShell(html: string, input: ProcessHtmlContentInput): string {
	if (input.htmlPreviewBundledTemplate !== "dashboard") return html
	return applyDashboardBundledShellToHtml(html)
}

// 输入参数接口
export interface ProcessHtmlContentInput {
	/** HTML内容字符串 */
	content: string
	/** 附件数组 */
	attachments?: any[]
	/** 文件ID */
	fileId?: string
	/** 文件名 */
	fileName?: string
	/** 附件列表 */
	attachmentList?: any[]
	/** 相对文件夹路径 */
	html_relative_path?: string
	/** 文件显示配置 */
	displayConfig?: any
	/** 预加载的 fileId -> url 映射 (用于批量处理时避免重复请求) */
	preloadedUrlMapping?: Map<string, string>
	/** 指定资源文件的版本号，用于按历史版本渲染依赖资源 */
	resourceFileVersions?: Record<string, number | undefined>
	/**
	 * 仅详情页 HTML 可视化预览：使用构建内 templates 入口 HTML；dashboard 另将 index.css / dashboard.js 换为打包 URL；audio/video 仅换 HTML 正文。数据与 magic.project 等仍走附件 OSS。
	 */
	htmlPreviewBundledTemplate?: HtmlPreviewBundledTemplateKind
	/** 图片处理参数，用于对资源图片进行压缩/缩放（通过 X-Magic-Image-Process 请求头） */
	xMagicImageProcess?: ImageProcessOptions
}

// 输出结果接口
export interface ProcessHtmlContentOutput {
	/** 处理后的HTML内容 */
	processedContent: string
	/** 是否包含幻灯片 */
	hasSlides: boolean
	/** 文件路径映射关系 */
	filePathMapping: Map<string, string>
	/** 幻灯片路径到文件ID的映射 */
	slidesMap: Map<string, string>
	/** 原始幻灯片路径数组 */
	originalSlidesPaths: string[]
}

/**
 * Collect all file IDs needed from HTML content (without fetching URLs)
 * Used for batch processing to avoid duplicate requests
 * @param input Input parameters (same as processHtmlContent)
 * @returns Set of file IDs that need to be fetched
 */
export function collectFileIdsFromHtml(input: ProcessHtmlContentInput): Set<string> {
	const { content, attachments, html_relative_path, displayConfig } = input

	// If no content or no attachments, return empty set
	if (!content || !attachments || attachments.length === 0) {
		return new Set()
	}

	// Parse HTML
	const parser = new DOMParser()
	const htmlDoc = parser.parseFromString(content, "text/html")

	// Flatten attachments
	const allFiles = flattenAttachments(attachments)

	// Get relative folder path
	const relativeFolderPath = html_relative_path || ""

	// Use shared logic to collect file IDs
	const { fileIdsToFetch } = collectHtmlResourcePlan(
		htmlDoc,
		allFiles,
		relativeFolderPath,
		displayConfig,
	)

	// Return unique file IDs
	return new Set(fileIdsToFetch)
}

/**
 * 处理HTML内容，替换相对路径为临时下载URL
 * @param input 输入参数
 * @returns 处理结果
 */
export async function processHtmlContent(
	input: ProcessHtmlContentInput,
): Promise<ProcessHtmlContentOutput> {
	const { content, attachments, fileId, displayConfig, attachmentList, html_relative_path } =
		input

	const previewKind = input.htmlPreviewBundledTemplate
	const bundledTemplateHtml = previewKind ? getBundledTemplateHtmlByKind(previewKind) : ""
	const sourceHtml = bundledTemplateHtml.length > 0 ? bundledTemplateHtml : content || ""
	const parsedMagicProject = parseMagicProjectJsContent(sourceHtml)
	const processingMetadata = mergePreviewBundledMetadata(
		parsedMagicProject?.config
			? {
					...displayConfig,
					...parsedMagicProject.config,
					slides: parsedMagicProject.slides,
				}
			: displayConfig,
		previewKind,
	)

	const applyPreviewShell = (html: string) => finalizeHtmlPreviewBundledShell(html, input)

	// 初始化返回值
	const result: ProcessHtmlContentOutput = {
		processedContent: sourceHtml,
		hasSlides: false,
		filePathMapping: new Map<string, string>(),
		slidesMap: new Map<string, string>(),
		originalSlidesPaths: [],
	}

	// 如果没有内容，直接返回
	if (!sourceHtml) {
		result.processedContent = applyPreviewShell(result.processedContent)
		return result
	}

	// 如果没有附件，应用替换后直接返回
	if (!attachments || attachments.length === 0) {
		let processedContent = replaceLocationReload(sourceHtml)
		// 注入 at() polyfill 脚本
		processedContent = injectAtPolyfillScript(processedContent)
		result.processedContent = applyPreviewShell(processedContent)
		return result
	}

	// 获取当前HTML文件的相对文件夹路径
	let htmlRelativeFolderPath = "/"
	if (fileId && attachmentList && attachmentList.length > 0) {
		const currentFile = attachmentList.find((item) => item.file_id === fileId)
		if (currentFile && currentFile.relative_file_path && currentFile.file_name) {
			// 从relative_file_path中去掉file_name，得到文件夹路径
			htmlRelativeFolderPath = currentFile.relative_file_path.replace(
				currentFile.file_name,
				"",
			)
		}
	}

	// 在调用 handleHtCdnUrl 之前，检测原始HTML中是否有 slide-bridge.js
	// 如果有，添加标记以便后续恢复
	let contentWithMarker = sourceHtml
	const tempParser = new DOMParser()
	const tempDoc = tempParser.parseFromString(sourceHtml, "text/html")
	const hasSlideBridge = Array.from(tempDoc.querySelectorAll("script")).some((script) =>
		script.getAttribute("src")?.includes("slide-bridge.js"),
	)
	if (hasSlideBridge && tempDoc.body) {
		tempDoc.body.setAttribute("data-has-slide-bridge", "true")
		// 获取DOCTYPE
		const doctype = tempDoc.doctype
		let doctypeString = ""
		if (doctype) {
			doctypeString = `<!DOCTYPE ${doctype.name}`
			if (doctype.publicId) {
				doctypeString += ` PUBLIC "${doctype.publicId}"`
			}
			if (doctype.systemId) {
				doctypeString += ` "${doctype.systemId}"`
			}
			doctypeString += ">\n"
		}
		contentWithMarker = doctypeString + tempDoc.documentElement.outerHTML
	}

	const htmlDoc = handleHtCdnUrl(contentWithMarker)

	// 将 Document 转成字符串（并还原序列化产生的实体），供后续 URL 替换、脚本注入等使用。
	const modifiedHtmlContent = serializeDocToHtml(htmlDoc)

	// 创建新的解析器和文档对象，使用修改后的内容继续处理
	const newParser = new DOMParser()
	const newHtmlDoc = newParser.parseFromString(sourceHtml, "text/html")

	const allFiles = flattenAttachments(attachments)

	// 从已扁平化的 allFiles 构建文件 ID 到更新时间的映射，用于 URL 缓存判断
	// 复用已扁平化的结果，避免重复扁平化 attachmentList
	const fileUpdatedAtMap = new Map<string, string>()
	for (const file of allFiles) {
		if (file.file_id && file.updated_at) {
			fileUpdatedAtMap.set(file.file_id, file.updated_at)
		}
	}

	// 首先提取slides数组
	let extractedSlides: string[] = parsedMagicProject?.slides || []
	let foundSlides = extractedSlides.length > 0
	const scriptElements2 = newHtmlDoc.getElementsByTagName("script")
	if (extractedSlides.length === 0) {
		for (let i = 0; i < scriptElements2.length; i++) {
			const script = scriptElements2[i]
			const scriptContent = script.textContent || script.innerHTML || ""
			if (scriptContent.includes("slides")) {
				foundSlides = true
				const slides = processingMetadata?.slides || extractSlidesFromScript(scriptContent)
				if (slides.length > 0) {
					extractedSlides = slides
					break
				}
			}
		}
	}
	result.hasSlides = foundSlides

	// 支持传入html_relative_path，用于处理ppt场景下iframe的相对路径
	const relativeFolderPath = html_relative_path || htmlRelativeFolderPath

	// Use shared logic to collect file IDs and build tracking maps
	const {
		fileIdsToFetch: collectedFileIds,
		urlMap,
		filePathMap,
		slidesMap,
		imageFileIds,
	} = collectHtmlResourcePlan(newHtmlDoc, allFiles, relativeFolderPath, processingMetadata)

	let fileIdsToFetch = collectedFileIds
	if (previewKind === "dashboard") {
		fileIdsToFetch = omitDashboardShellFromFetchPlan(fileIdsToFetch, urlMap)
	}

	// If there are resources to replace, fetch their temporary URLs
	if (fileIdsToFetch.length > 0) {
		try {
			const replacedResources = await replaceHtmlResourceUrls({
				fileIds: fileIdsToFetch,
				resourceFileVersions: input.resourceFileVersions,
				preloadedUrlMapping: input.preloadedUrlMapping,
				imageProcessOptions: input.xMagicImageProcess,
				imageFileIds,
				fileUpdatedAtMap,
				htmlContent: modifiedHtmlContent,
				urlMap,
				filePathMap,
				processingMetadata,
				allFiles,
				relativeFolderPath,
			})

			// 替换 window.location.reload 为 window.Magic.reload
			let updatedContent = replaceLocationReload(replacedResources.content)
			// 注入 at() polyfill 脚本
			updatedContent = injectAtPolyfillScript(updatedContent)

			result.processedContent = applyPreviewShell(updatedContent)
			result.filePathMapping = replacedResources.filePathMapping
		} catch (error) {
			console.error("Error fetching resource URLs:", error)
			// 即使出错，也要替换脚本
			let processedContent = replaceLocationReload(modifiedHtmlContent)
			// 注入 at() polyfill 脚本
			processedContent = injectAtPolyfillScript(processedContent)
			result.processedContent = applyPreviewShell(processedContent)
		}
	} else {
		// 没有需要替换的资源，但仍需要替换脚本
		let processedContent = replaceLocationReload(modifiedHtmlContent)
		// 注入 at() polyfill 脚本
		processedContent = injectAtPolyfillScript(processedContent)
		result.processedContent = applyPreviewShell(processedContent)
	}

	// 将 slidesMap 和原始路径添加到结果中
	result.slidesMap = slidesMap
	result.originalSlidesPaths = extractedSlides

	return result
}
