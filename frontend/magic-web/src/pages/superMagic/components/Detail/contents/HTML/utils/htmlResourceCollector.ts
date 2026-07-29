import {
	processAudioArray,
	processElementsWithAttribute,
	processInlineStyles,
	processSlidesArray,
	processStyleUrls,
} from "./index"
import { processDashboardArray } from "../dashboard/utils"
import type { FileItem } from "./fetchInterceptor"

export interface HtmlDisplayConfig {
	type?: string
	slides?: string[]
	[key: string]: unknown
}

export interface HtmlResourceInfo {
	path: string
	attr: string
	tag: string
	contentType?: string
	type?: string
	fileName?: string
	url?: string
}

export interface HtmlResourcePlan {
	fileIdsToFetch: string[]
	urlMap: Map<string, HtmlResourceInfo>
	filePathMap: Map<string, string>
	slidesMap: Map<string, string>
	imageFileIds: Set<string>
}

/**
 * Collect relative resources referenced by an HTML document and classify images.
 * Image classification is kept here so URL resolution can apply processing only
 * to visual assets without affecting scripts, stylesheets, fonts, or media files.
 */
export function collectHtmlResourcePlan(
	htmlDoc: Document,
	allFiles: FileItem[],
	relativeFolderPath: string,
	displayConfig?: HtmlDisplayConfig,
): HtmlResourcePlan {
	const fileIdsToFetch: string[] = []
	const urlsToReplace: string[] = []
	const urlMap = new Map<string, HtmlResourceInfo>()
	const filePathMap = new Map<string, string>()
	const slidesMap = new Map<string, string>()
	const imageFileIds = new Set<string>()

	const collectElementResource = (
		tagName: string,
		attributeName: string,
		additionalFilter?: (element: Element) => boolean,
	) => {
		processElementsWithAttribute({
			elements: htmlDoc.getElementsByTagName(tagName),
			attributeName,
			tagName,
			allFiles,
			urlsToReplace,
			fileIdsToFetch,
			urlMap,
			additionalFilter,
			htmlRelativeFolderPath: relativeFolderPath,
		})
	}

	collectElementResource("img", "src")
	collectElementResource(
		"link",
		"href",
		(element) => element.getAttribute("rel") === "stylesheet",
	)
	collectElementResource("script", "src")
	collectElementResource("iframe", "src")
	collectElementResource("source", "src")
	collectElementResource("video", "src")
	collectElementResource("audio", "src")
	collectElementResource("object", "src")

	processSlidesArray({
		htmlDoc,
		allFiles,
		fileIdsToFetch,
		urlMap,
		slidesMap,
		htmlRelativeFolderPath: relativeFolderPath,
		displayConfig,
	})

	processStyleUrls({
		htmlDoc,
		allFiles,
		fileIdsToFetch,
		filePathMap,
		htmlRelativeFolderPath: relativeFolderPath,
		urlMap,
	})

	processInlineStyles({
		htmlDoc,
		allFiles,
		fileIdsToFetch,
		filePathMap,
		htmlRelativeFolderPath: relativeFolderPath,
		urlMap,
	})

	if (displayConfig?.type === "dashboard") {
		processDashboardArray({
			htmlDoc,
			allFiles,
			fileIdsToFetch,
			urlMap,
			htmlRelativeFolderPath: relativeFolderPath,
		})
	}

	if (displayConfig?.type === "audio" || displayConfig?.type === "video") {
		processAudioArray({
			htmlDoc,
			allFiles,
			fileIdsToFetch,
			urlMap,
			htmlRelativeFolderPath: relativeFolderPath,
		})
	}

	urlMap.forEach((info, id) => {
		if (info.contentType?.startsWith("image/")) {
			imageFileIds.add(id)
		}
	})

	return { fileIdsToFetch, urlMap, filePathMap, slidesMap, imageFileIds }
}
