import { isEqual } from "lodash-es"
import type { LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import {
	getContents,
	supportsVisualUnderstanding,
} from "@/components/CanvasDesign/runtime/document/elementContent"
import type {
	ElementDetailSource,
	ElementDetailsProvenance,
} from "@/components/CanvasDesign/runtime/document/elementDetailsProvenance"

export const ELEMENT_DETAILS_FILENAME = "element-details.json"
export const ELEMENT_DETAILS_USER_FILENAME = "element-details-user.json"
export const ELEMENT_DETAILS_VERSION = "2.0.0"
export const ELEMENT_DETAIL_SOURCE_USER = "user"

export const HEAVY_FIELDS = [
	"generateImageRequest",
	"generateVideoRequest",
	"visualUnderstanding",
	"videoGenerationResultMeta",
] as const

const NON_VISUAL_HEAVY_FIELDS = ["generateImageRequest", "generateVideoRequest"] as const

export type ElementHeavyFields = Record<string, unknown>
export type ContentDetailEntry = ElementHeavyFields
export type ElementDetailEntry = ElementHeavyFields & {
	source?: string
	contentDetails?: Record<string, ContentDetailEntry>
}

export interface ElementDetailsDoc {
	version: string
	elements: Record<string, ElementDetailEntry>
}

/** 未发布图片版本 sidecar，不属于当前 v3 contentDetails 协议。 */
export function hasUnsupportedElementDetailsStructure(raw: unknown): boolean {
	if (!raw || typeof raw !== "object") return false
	const record = raw as Record<string, unknown>
	if (record.imageVersionDetails !== undefined) return true
	const elements = record.elements
	if (!elements || typeof elements !== "object" || Array.isArray(elements)) return false
	return Object.values(elements as Record<string, unknown>).some(
		(entry) =>
			!!entry &&
			typeof entry === "object" &&
			(entry as Record<string, unknown>).imageVersionDetails !== undefined,
	)
}

export function emptyElementDetailsDoc(): ElementDetailsDoc {
	return { version: ELEMENT_DETAILS_VERSION, elements: {} }
}

export function normalizeElementDetailsDoc(raw: unknown): ElementDetailsDoc {
	if (
		!raw ||
		typeof raw !== "object" ||
		typeof (raw as { elements?: unknown }).elements !== "object" ||
		(raw as { elements?: unknown }).elements === null
	) {
		return emptyElementDetailsDoc()
	}
	const data = raw as { version?: unknown; elements: Record<string, ElementDetailEntry> }
	return {
		version: typeof data.version === "string" ? data.version : ELEMENT_DETAILS_VERSION,
		elements: data.elements,
	}
}

type AnyElement = LayerElement & { children?: LayerElement[]; [key: string]: unknown }

function walkElements(
	elements: LayerElement[] | undefined,
	visit: (element: AnyElement) => void,
): void {
	if (!elements?.length) return
	for (const element of elements) {
		const anyElement = element as AnyElement
		visit(anyElement)
		if (Array.isArray(anyElement.children)) walkElements(anyElement.children, visit)
	}
}

export function collectElementIds(elements: LayerElement[] | undefined): Set<string> {
	const ids = new Set<string>()
	walkElements(elements, (element) => {
		if (element.id) ids.add(element.id)
	})
	return ids
}

function getHeavyFieldsForElement(type: string): readonly string[] {
	return supportsVisualUnderstanding(type) ? HEAVY_FIELDS : NON_VISUAL_HEAVY_FIELDS
}

function pickContentDetails(element: AnyElement): Record<string, ContentDetailEntry> | null {
	const details: Record<string, ContentDetailEntry> = {}
	const heavyFields = getHeavyFieldsForElement(element.type)
	for (const content of getContents(element) as unknown as Array<
		Record<string, unknown> & { contentId: string }
	>) {
		const detail: ContentDetailEntry = {}
		for (const field of heavyFields) {
			const value = content[field]
			if (value !== undefined && value !== null) detail[field] = value
		}
		if (Object.keys(detail).length > 0) details[content.contentId] = detail
	}
	return Object.keys(details).length > 0 ? details : null
}

export function stripHeavyFields(elements: LayerElement[] | undefined): void {
	walkElements(elements, (element) => {
		const contents = getContents(element) as unknown as Array<Record<string, unknown>>
		for (const content of contents) {
			for (const field of HEAVY_FIELDS) delete content[field]
		}
		for (const field of HEAVY_FIELDS) delete element[field]
	})
}

function stripEntryMeta(entry: ElementDetailEntry | undefined, type: string): ElementHeavyFields {
	if (!entry) return {}
	const result: ElementHeavyFields = {}
	const heavyFields = getHeavyFieldsForElement(type)
	if (entry.contentDetails) {
		const contentDetails: Record<string, ContentDetailEntry> = {}
		for (const [contentId, contentDetail] of Object.entries(entry.contentDetails)) {
			const nextDetail: ContentDetailEntry = {}
			for (const field of heavyFields) {
				const value = contentDetail[field]
				if (value !== undefined && value !== null) nextDetail[field] = value
			}
			if (Object.keys(nextDetail).length > 0) contentDetails[contentId] = nextDetail
		}
		if (Object.keys(contentDetails).length > 0) result.contentDetails = contentDetails
	}
	for (const field of heavyFields) {
		if (entry[field] !== undefined && entry[field] !== null) result[field] = entry[field]
	}
	return result
}

function resolveWinner(
	userEntry: ElementDetailEntry | undefined,
	agentEntry: ElementDetailEntry | undefined,
): { entry: ElementDetailEntry | undefined; source: ElementDetailSource } {
	if (userEntry?.source === ELEMENT_DETAIL_SOURCE_USER)
		return { entry: userEntry, source: "user" }
	if (agentEntry) return { entry: agentEntry, source: "agent" }
	if (userEntry) return { entry: userEntry, source: "user" }
	return { entry: undefined, source: "unknown" }
}

function getRequestImageId(request: unknown): string | undefined {
	if (!request || typeof request !== "object") return undefined
	const imageId = (request as { image_id?: unknown }).image_id
	return typeof imageId === "string" && imageId.trim() ? imageId : undefined
}

export function rehydrateHeavyFields(
	elements: LayerElement[] | undefined,
	userDoc: ElementDetailsDoc,
	agentDoc: ElementDetailsDoc,
): ElementDetailsProvenance {
	const provenance: ElementDetailsProvenance = {}
	walkElements(elements, (rawElement) => {
		const element = rawElement as AnyElement
		const heavyFields = getHeavyFieldsForElement(element.type)
		const userEntry = userDoc.elements[element.id]
		const agentEntry = agentDoc.elements[element.id]
		const contentProvenance: NonNullable<ElementDetailsProvenance[string]["contentDetails"]> =
			{}
		const { entry: legacyWinner, source: legacyWinnerSource } = resolveWinner(
			userEntry,
			agentEntry,
		)
		const firstContent = getContents(element)[0] as unknown as
			Record<string, unknown> | undefined
		let legacyFieldsAppliedToFirstContent = false
		if (legacyWinner && firstContent) {
			for (const field of heavyFields) {
				if (firstContent[field] === undefined && legacyWinner[field] !== undefined) {
					firstContent[field] = legacyWinner[field]
					legacyFieldsAppliedToFirstContent = true
				}
			}
		}

		for (const content of getContents(element) as unknown as Array<
			Record<string, unknown> & { contentId: string }
		>) {
			const userContent = userEntry?.contentDetails?.[content.contentId]
			const agentContent = agentEntry?.contentDetails?.[content.contentId]
			const { entry: winner, source: winnerSource } = resolveWinner(
				userContent ? { ...userContent, source: userEntry?.source } : undefined,
				agentContent ? { ...agentContent, source: agentEntry?.source } : undefined,
			)
			if (winner) {
				for (const field of heavyFields) {
					if (winner[field] !== undefined && winner[field] !== null)
						content[field] = winner[field]
				}
			}
			const imageId = getRequestImageId(content.generateImageRequest)
			if (imageId) {
				const source = winner
					? winnerSource
					: content === firstContent && legacyFieldsAppliedToFirstContent
						? legacyWinnerSource
						: "inline"
				contentProvenance[content.contentId] = {
					generateImageRequest: {
						valueSource: source,
						imageId,
						imageIdSource: source,
					},
				}
			}
		}

		if (Object.keys(contentProvenance).length > 0)
			provenance[element.id] = { contentDetails: contentProvenance }
	})
	return provenance
}

export function buildUserElementDetailsDoc(
	elements: LayerElement[] | undefined,
	agentBaseline: ElementDetailsDoc,
): ElementDetailsDoc {
	const result: Record<string, ElementDetailEntry> = {}
	walkElements(elements, (rawElement) => {
		const element = rawElement as AnyElement
		const contentDetails = pickContentDetails(element)
		if (!contentDetails) return
		const detail = { contentDetails }
		const baselineDetail = stripEntryMeta(agentBaseline.elements[element.id], element.type)
		if (isEqual(detail, baselineDetail)) return
		result[element.id] = { ...detail, source: ELEMENT_DETAIL_SOURCE_USER }
	})
	return { version: ELEMENT_DETAILS_VERSION, elements: result }
}
