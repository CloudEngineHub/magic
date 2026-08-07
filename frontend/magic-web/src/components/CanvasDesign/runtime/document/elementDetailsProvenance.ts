import type { LayerElement } from "./types"
import { getActiveImageVersion, isImageElementV2 } from "./imageVersion"

/**
 * 重字段的运行时来源。
 *
 * 该信息只用于区分 Agent 产物记录与前端 Design API 任务，不属于画布 DSL，
 * 因此不得挂到 Element data、历史快照或剪贴板数据中。
 */
export type ElementDetailSource = "agent" | "user" | "inline" | "unknown"

export interface GenerateImageRequestProvenance {
	/** 当前完整 generateImageRequest 值来自哪里 */
	valueSource: ElementDetailSource
	/** 与 imageIdSource 对应的 image_id，用于避免元素后续换任务后误用旧来源 */
	imageId?: string
	/** 当前 image_id 的任务身份来源 */
	imageIdSource: ElementDetailSource
}

export interface ElementDetailProvenance {
	generateImageRequest?: GenerateImageRequestProvenance
	imageVersionDetails?: Record<string, { generateImageRequest?: GenerateImageRequestProvenance }>
}

export type ElementDetailsProvenance = Record<string, ElementDetailProvenance>

type ElementWithChildren = LayerElement & { children?: LayerElement[] }

function getGenerateImageRequestImageId(element: LayerElement): string | undefined {
	if (element.type !== "image") return undefined
	const imageId = getActiveImageVersion(element).generateImageRequest?.image_id
	return typeof imageId === "string" && imageId.trim() ? imageId : undefined
}

function walkElements(
	elements: LayerElement[] | undefined,
	visit: (element: LayerElement) => void,
): void {
	if (!elements?.length) return
	for (const element of elements) {
		visit(element)
		const children = (element as ElementWithChildren).children
		if (Array.isArray(children)) {
			walkElements(children, visit)
		}
	}
}

/** 为仍把重字段内联在主 DSL 的旧数据建立兼容来源。 */
export function buildInlineElementDetailsProvenance(
	elements: LayerElement[] | undefined,
): ElementDetailsProvenance {
	const provenance: ElementDetailsProvenance = {}
	walkElements(elements, (element) => {
		if (element.type !== "image") return
		if (isImageElementV2(element)) {
			const imageVersionDetails: ElementDetailProvenance["imageVersionDetails"] = {}
			for (const version of element.versions) {
				const imageId = version.generateImageRequest?.image_id
				if (!imageId) continue
				imageVersionDetails[version.id] = {
					generateImageRequest: {
						valueSource: "inline",
						imageId,
						imageIdSource: "inline",
					},
				}
			}
			if (Object.keys(imageVersionDetails).length > 0) {
				provenance[element.id] = { imageVersionDetails }
			}
			return
		}
		const imageId = getGenerateImageRequestImageId(element)
		if (!imageId) return
		provenance[element.id] = {
			generateImageRequest: {
				valueSource: "inline",
				imageId,
				imageIdSource: "inline",
			},
		}
	})
	return provenance
}

/**
 * 只保留仍与当前元素 image_id 匹配的来源记录。
 * 远端合并或本地编辑产生新对象时，可用多个候选表重建安全的 Runtime 来源。
 */
export function reconcileElementDetailsProvenance(
	elements: LayerElement[] | undefined,
	...candidates: Array<ElementDetailsProvenance | null | undefined>
): ElementDetailsProvenance {
	const result: ElementDetailsProvenance = {}
	walkElements(elements, (element) => {
		if (element.type === "image" && isImageElementV2(element)) {
			const imageVersionDetails: NonNullable<ElementDetailProvenance["imageVersionDetails"]> =
				{}
			for (const version of element.versions) {
				const imageId = version.generateImageRequest?.image_id
				if (!imageId) continue
				const matches = candidates
					.map(
						(candidate) =>
							candidate?.[element.id]?.imageVersionDetails?.[version.id]
								?.generateImageRequest,
					)
					.filter(
						(entry): entry is GenerateImageRequestProvenance =>
							entry?.imageId === imageId,
					)
				const match = chooseProvenance(matches)
				imageVersionDetails[version.id] = {
					generateImageRequest: match ?? unknownProvenance(imageId),
				}
			}
			if (Object.keys(imageVersionDetails).length > 0) {
				result[element.id] = { imageVersionDetails }
			}
			return
		}
		const imageId = getGenerateImageRequestImageId(element)
		if (!imageId) return

		const matches = candidates
			.map((candidate) => candidate?.[element.id]?.generateImageRequest)
			.filter((entry): entry is GenerateImageRequestProvenance => entry?.imageId === imageId)

		const match = chooseProvenance(matches)

		result[element.id] = {
			generateImageRequest: match ?? unknownProvenance(imageId),
		}
	})
	return result
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
