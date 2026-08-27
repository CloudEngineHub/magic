import type {
	CanvasDocument,
	CanvasConnection,
	LayerElement,
	StoryboardShot,
} from "@/components/CanvasDesign/runtime/document/types"
import { ElementTypeEnum } from "@/components/CanvasDesign/runtime/document/types"
import { cloneCanvasConnections } from "@/components/CanvasDesign/runtime/document/connectionIndex"
import {
	normalizeLegacyHighImageTaskMeta,
	supportsVisualUnderstanding,
} from "@/components/CanvasDesign/runtime/document/elementContent"
import { normalizeStoryboardShot } from "@/components/CanvasDesign/runtime/document/storyboardMigration"
import { validateElementData } from "@/components/CanvasDesign/runtime/document/validateElement"
import { cloneDeep } from "lodash-es"
import { MAGIC_PROJECT_VERSION_V3 } from "./magicProjectCompression"
import type { DesignData } from "../types"

type UnknownRecord = Record<string, unknown>

interface VideoEditLegacyMigrationContext {
	connections: CanvasConnection[]
	connectionIds: Set<string>
	connectionPairs: Set<string>
}

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
		"visualUnderstanding",
		"src",
		"status",
		"errorMessage",
		"generateImageRequest",
		"imageGenerationTaskMeta",
		"generateHightImageRequest",
		"crop",
	],
	[ElementTypeEnum.Video]: [
		"visualUnderstanding",
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
	[ElementTypeEnum.VideoEdit]: ["videoSequence", "audioSequence"],
}

function cloneValue<T>(value: T): T {
	return cloneDeep(value)
}

function getLegacyFields(type: unknown): readonly string[] {
	return LEGACY_CONTENT_FIELDS_BY_TYPE[String(type)] ?? []
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

/** v1/v2 导出可能把可选字段写成 null；v3 校验只接受 undefined 或合法类型。 */
function stripNullOptionalFields(record: UnknownRecord, fields: readonly string[]): void {
	for (const field of fields) {
		if (record[field] === null) delete record[field]
	}
}

function normalizeLegacyElementShell(element: UnknownRecord): void {
	stripNullOptionalFields(element, ["visible", "locked", "opacity", "scaleX", "scaleY", "name"])
}

function normalizeLegacyContentFields(content: UnknownRecord): void {
	stripNullOptionalFields(content, ["src", "status", "errorMessage"])
}

function migrateContentList(element: UnknownRecord, elementId: string): UnknownRecord[] {
	const rawContents = Array.isArray(element.contents) ? element.contents : []
	return rawContents.map((rawContent, index) => {
		const content =
			rawContent && typeof rawContent === "object" ? { ...(rawContent as UnknownRecord) } : {}
		const contentId = readContentId(content, `${elementId}-content-${index + 1}`)
		normalizeLegacyContentFields(content)
		if (
			(element.type === ElementTypeEnum.Image || element.type === ElementTypeEnum.Video) &&
			content.errorMessage === null
		) {
			delete content.errorMessage
		}
		// 旧版本曾把该字段放在公共 Content；非媒体节点不应继续携带这份无效数据。
		if (!supportsVisualUnderstanding(String(element.type))) delete content.visualUnderstanding
		delete content.id
		delete content.type
		content.contentId = contentId
		return content
	})
}

function createConnectionPairKey(sourceElementId: string, targetElementId: string): string {
	return `${sourceElementId}\u0000${targetElementId}`
}

function createMigratedConnectionId(
	targetElementId: string,
	role: "video" | "audio",
	index: number,
	context: VideoEditLegacyMigrationContext,
): string {
	const baseId = `${targetElementId}-legacy-${role}-${index + 1}`
	let id = baseId
	let suffix = 2
	while (context.connectionIds.has(id)) id = `${baseId}-${suffix++}`
	context.connectionIds.add(id)
	return id
}

function migrateLegacyVideoEditConnections(
	elementId: string,
	contents: UnknownRecord[],
	context: VideoEditLegacyMigrationContext,
): void {
	contents.forEach((content) => {
		// VideoEdit output 配置从未正式上线，升级时直接丢弃，不进入新的 DSL。
		delete content.output
		const videoSequence = Array.isArray(content.videoSequence)
			? content.videoSequence.filter(
					(id): id is string => typeof id === "string" && id.length > 0,
				)
			: []
		const audioSequence = Array.isArray(content.audioSequence)
			? content.audioSequence.filter(
					(id): id is string => typeof id === "string" && id.length > 0,
				)
			: []

		for (const [role, sequence] of [
			["video", videoSequence],
			["audio", audioSequence.slice(0, 1)],
		] as const) {
			sequence.forEach((sourceElementId, index) => {
				const pairKey = createConnectionPairKey(sourceElementId, elementId)
				if (context.connectionPairs.has(pairKey)) return
				context.connectionPairs.add(pairKey)
				context.connections.push({
					id: createMigratedConnectionId(elementId, role, index, context),
					sourceElementId,
					targetElementId: elementId,
				})
			})
		}

	})
}

function migrateElementToV3(
	rawElement: unknown,
	context: VideoEditLegacyMigrationContext,
): LayerElement {
	if (!rawElement || typeof rawElement !== "object" || Array.isArray(rawElement)) {
		throw new Error("Invalid canvas element")
	}

	const element = cloneValue(rawElement as UnknownRecord)
	normalizeLegacyElementShell(element)
	const elementId = typeof element.id === "string" ? element.id : ""
	if (!elementId || typeof element.type !== "string") {
		throw new Error("Canvas element id/type is required")
	}
	if (element.type === ElementTypeEnum.VideoEdit) {
		// 未上线的旧输出配置不迁移到新 DSL。
		delete element.output
	}

	const hadContents = Array.isArray(element.contents)
	const contents = migrateContentList(element, elementId)
	if (!supportsVisualUnderstanding(element.type)) delete element.visualUnderstanding
	const legacyFields = getLegacyFields(element.type)
	const firstContent = contents[0] ?? { contentId: createFirstContentId(elementId) }
	for (const field of legacyFields) {
		if (element[field] === undefined) continue
		if (element[field] === null) {
			delete element[field]
			continue
		}
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
	if (element.type === ElementTypeEnum.Storyboard) {
		contents.forEach((content) => {
			if (Array.isArray(content.shots)) {
				content.shots = content.shots.map((shot) =>
					normalizeStoryboardShot(shot as StoryboardShot),
				)
			}
		})
	}
	if (element.type === ElementTypeEnum.VideoEdit) {
		migrateLegacyVideoEditConnections(elementId, contents, context)
	}

	contents.forEach((content) => normalizeLegacyContentFields(content))

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
		migrated.children = migrated.children.map((child) => migrateElementToV3(child, context))
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
		const connections = Array.isArray(next.canvas.connections)
			? cloneCanvasConnections(next.canvas.connections as CanvasConnection[])
			: []
		const migrationContext: VideoEditLegacyMigrationContext = {
			connections,
			connectionIds: new Set(connections.map((connection) => connection.id)),
			connectionPairs: new Set(
				connections.map((connection) =>
					createConnectionPairKey(connection.sourceElementId, connection.targetElementId),
				),
			),
		}
		const elements = (next.canvas.elements ?? []).map((element) =>
			migrateElementToV3(element, migrationContext),
		)
		next.canvas = {
			...next.canvas,
			elements,
			connections: migrationContext.connections,
		} satisfies CanvasDocument
	}
	next.version = MAGIC_PROJECT_VERSION_V3
	return next
}

/** 对已完成迁移的 v3 文档做最终校验，供 Remote/Draft/History 共用。 */
export function validateV3CanvasDocument(document: CanvasDocument | undefined): void {
	for (const element of document?.elements ?? []) validateElementData(element)
}
