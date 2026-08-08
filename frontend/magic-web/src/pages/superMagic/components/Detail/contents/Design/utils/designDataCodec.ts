import type { CanvasDocument, LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import { ElementTypeEnum } from "@/components/CanvasDesign/runtime/document/types"
import { normalizeLegacyHighImageTaskMeta } from "@/components/CanvasDesign/runtime/document/elementContent"
import { validateElementData } from "@/components/CanvasDesign/runtime/document/validateElement"
import { cloneDeep } from "lodash-es"
import { MAGIC_PROJECT_VERSION_V3 } from "./magicProjectCompression"
import type { DesignData } from "../types"

type UnknownRecord = Record<string, unknown>

const LEGACY_COMMON_CONTENT_FIELDS = ["visualUnderstanding"] as const

export interface DesignDataCodecInput {
	type: string
	name: string
	version?: unknown
	canvas?: {
		elements?: unknown[]
		connections?: unknown
		[key: string]: unknown
	}
	[key: string]: unknown
}

/**
 * v1/v2 的主文件仍可能把业务字段直接写在 Element 外壳上。
 * 迁移只在这里发生一次；Canvas Runtime 不再读取或推断这些历史字段。
 */
const LEGACY_CONTENT_FIELDS_BY_TYPE: Partial<Record<string, readonly string[]>> = {
	[ElementTypeEnum.Image]: [
		"src",
		"status",
		"errorMessage",
		"generateImageRequest",
		"imageGenerationTaskMeta",
		"generateHightImageRequest",
		"crop",
	],
	[ElementTypeEnum.Video]: [
		"src",
		"status",
		"errorMessage",
		"generateVideoRequest",
		"videoGenerationResultMeta",
	],
	[ElementTypeEnum.Audio]: ["src"],
	[ElementTypeEnum.Text]: ["content", "defaultStyle"],
	[ElementTypeEnum.Rectangle]: ["fill", "stroke", "strokeWidth", "cornerRadius"],
	[ElementTypeEnum.Ellipse]: ["fill", "stroke", "strokeWidth"],
	[ElementTypeEnum.Triangle]: ["fill", "stroke", "strokeWidth"],
	[ElementTypeEnum.Star]: [
		"fill",
		"stroke",
		"strokeWidth",
		"cornerRadius",
		"sides",
		"innerRadiusRatio",
	],
	[ElementTypeEnum.Storyboard]: ["generationConfig", "shots"],
	[ElementTypeEnum.VideoEdit]: ["videoSequence", "audioSequence", "output"],
}

function cloneValue<T>(value: T): T {
	return cloneDeep(value)
}

function getLegacyFields(type: unknown): readonly string[] {
	return [...LEGACY_COMMON_CONTENT_FIELDS, ...(LEGACY_CONTENT_FIELDS_BY_TYPE[String(type)] ?? [])]
}

function createFirstContentId(elementId: string): string {
	return `${elementId}-content-1`
}

function readContentId(value: unknown, fallback: string): string {
	if (!value || typeof value !== "object") return fallback
	const record = value as UnknownRecord
	return typeof record.contentId === "string" && record.contentId.length > 0
		? record.contentId
		: fallback
}

function migrateContentList(element: UnknownRecord, elementId: string): UnknownRecord[] {
	const rawContents = Array.isArray(element.contents) ? element.contents : []
	return rawContents.map((rawContent, index) => {
		const content =
			rawContent && typeof rawContent === "object" ? { ...(rawContent as UnknownRecord) } : {}
		const contentId = readContentId(content, `${elementId}-content-${index + 1}`)
		delete content.id
		delete content.type
		content.contentId = contentId
		return content
	})
}

function migrateElementToV3(rawElement: unknown): LayerElement {
	if (!rawElement || typeof rawElement !== "object" || Array.isArray(rawElement)) {
		throw new Error("Invalid canvas element")
	}

	const element = cloneValue(rawElement as UnknownRecord)
	const elementId = typeof element.id === "string" ? element.id : ""
	if (!elementId || typeof element.type !== "string") {
		throw new Error("Canvas element id/type is required")
	}

	const hadContents = Array.isArray(element.contents)
	const contents = migrateContentList(element, elementId)
	const legacyFields = getLegacyFields(element.type)
	const firstContent = contents[0] ?? { contentId: createFirstContentId(elementId) }
	for (const field of legacyFields) {
		if (element[field] === undefined) continue
		if (firstContent[field] === undefined) firstContent[field] = cloneValue(element[field])
		delete element[field]
	}
	if (element.type === ElementTypeEnum.Image) {
		if (firstContent.imageGenerationTaskMeta === undefined) {
			const legacyHighRequest = firstContent.generateHightImageRequest as
				Parameters<typeof normalizeLegacyHighImageTaskMeta>[0] | undefined
			const converted = normalizeLegacyHighImageTaskMeta(legacyHighRequest)
			if (converted) firstContent.imageGenerationTaskMeta = converted
		}
		delete firstContent.generateHightImageRequest
	}
	if (!hadContents && contents.length === 0) contents.push(firstContent)
	if (hadContents && contents.length === 0 && Object.keys(firstContent).length > 1) {
		contents.push(firstContent)
	}

	const contentIds = new Set(contents.map((content) => String(content.contentId)).filter(Boolean))
	const activeContentId =
		typeof element.activeContentId === "string" && contentIds.has(element.activeContentId)
			? element.activeContentId
			: (contents[0]?.contentId ?? null)
	const mainContentId =
		typeof element.mainContentId === "string" && contentIds.has(element.mainContentId)
			? element.mainContentId
			: (contents[0]?.contentId ?? null)

	delete element.contents
	delete element.activeContentId
	delete element.mainContentId
	const migrated: UnknownRecord = {
		...element,
		contents,
		activeContentId,
		mainContentId,
	}

	if (Array.isArray(migrated.children)) {
		migrated.children = migrated.children.map((child) => migrateElementToV3(child))
	}

	validateElementData(migrated)
	return migrated as unknown as LayerElement
}

/**
 * 把加载层拿到的任意已发布画布格式转换成 Runtime 唯一接受的 v3。
 * 该入口同时覆盖明文/压缩 canvas，因为压缩协议由上层解析后再进入这里。
 */
export function upgradeDesignDataToV3(designData: DesignData | DesignDataCodecInput): DesignData {
	const next = cloneValue(designData) as unknown as DesignData
	if (next.canvas) {
		next.canvas = {
			...next.canvas,
			elements: (next.canvas.elements ?? []).map((element) => migrateElementToV3(element)),
		} satisfies CanvasDocument
	}
	next.version = MAGIC_PROJECT_VERSION_V3
	return next
}

/** 对已完成迁移的 v3 文档做最终校验，供 Remote/Draft/History 共用。 */
export function validateV3CanvasDocument(document: CanvasDocument | undefined): void {
	for (const element of document?.elements ?? []) validateElementData(element)
}
