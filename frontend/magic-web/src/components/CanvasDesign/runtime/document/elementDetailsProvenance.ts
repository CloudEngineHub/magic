import { getContents } from "./elementContent"
import type { ElementContentBase, LayerElement } from "./types"

export type ElementDetailSource = "agent" | "user" | "inline" | "unknown"

export interface GenerateImageRequestProvenance {
	valueSource: ElementDetailSource
	imageId?: string
	imageIdSource: ElementDetailSource
}

export interface ElementContentDetailProvenance {
	generateImageRequest?: GenerateImageRequestProvenance
}

export interface ElementDetailProvenance {
	contentDetails?: Record<string, ElementContentDetailProvenance>
}

export type ElementDetailsProvenance = Record<string, ElementDetailProvenance>

type ElementWithChildren = LayerElement & { children?: LayerElement[] }

function walkElements(
	elements: LayerElement[] | undefined,
	visit: (element: LayerElement) => void,
): void {
	if (!elements?.length) return
	for (const element of elements) {
		visit(element)
		const children = (element as ElementWithChildren).children
		if (Array.isArray(children)) walkElements(children, visit)
	}
}

export function buildInlineElementDetailsProvenance(
	elements: LayerElement[] | undefined,
): ElementDetailsProvenance {
	const provenance: ElementDetailsProvenance = {}
	walkElements(elements, (element) => {
		const contentDetails: Record<string, ElementContentDetailProvenance> = {}
		for (const content of getContents(element) as unknown as Array<
			ElementContentBase & Record<string, unknown>
		>) {
			const imageId = getRequestImageId(content.generateImageRequest)
			if (!imageId) continue
			contentDetails[content.contentId] = {
				generateImageRequest: {
					valueSource: "inline",
					imageId,
					imageIdSource: "inline",
				},
			}
		}
		if (Object.keys(contentDetails).length > 0) provenance[element.id] = { contentDetails }
	})
	return provenance
}

export function reconcileElementDetailsProvenance(
	elements: LayerElement[] | undefined,
	...candidates: Array<ElementDetailsProvenance | null | undefined>
): ElementDetailsProvenance {
	const result: ElementDetailsProvenance = {}
	walkElements(elements, (element) => {
		const contentDetails: Record<string, ElementContentDetailProvenance> = {}
		for (const content of getContents(element) as unknown as Array<
			ElementContentBase & Record<string, unknown>
		>) {
			const imageId = getRequestImageId(content.generateImageRequest)
			if (!imageId) continue
			const matches = candidates
				.map(
					(candidate) =>
						candidate?.[element.id]?.contentDetails?.[content.contentId]
							?.generateImageRequest,
				)
				.filter(
					(entry): entry is GenerateImageRequestProvenance => entry?.imageId === imageId,
				)
			contentDetails[content.contentId] = {
				generateImageRequest: chooseProvenance(matches) ?? unknownProvenance(imageId),
			}
		}
		if (Object.keys(contentDetails).length > 0) result[element.id] = { contentDetails }
	})
	return result
}

function getRequestImageId(request: unknown): string | undefined {
	if (!request || typeof request !== "object") return undefined
	const imageId = (request as { image_id?: unknown }).image_id
	return typeof imageId === "string" && imageId.trim() ? imageId : undefined
}

function chooseProvenance(
	matches: GenerateImageRequestProvenance[],
): GenerateImageRequestProvenance | undefined {
	return (
		matches.find((entry) => entry.imageIdSource === "agent") ??
		matches.find((entry) => entry.imageIdSource === "user") ??
		matches.find((entry) => entry.imageIdSource === "inline") ??
		matches[0]
	)
}

function unknownProvenance(imageId: string): GenerateImageRequestProvenance {
	return { valueSource: "unknown", imageId, imageIdSource: "unknown" }
}
