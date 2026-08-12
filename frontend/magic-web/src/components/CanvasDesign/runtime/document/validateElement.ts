import { ElementTypeEnum, type LayerElement } from "./types"
import { getElementContentFields } from "./elementContent"

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function isOptionalString(value: unknown): boolean {
	return value === undefined || typeof value === "string"
}

function isValidCropConfig(value: unknown): boolean {
	if (!isObject(value)) return false
	return ["width", "height", "x", "y"].every((field) => isFiniteNumber(value[field]))
}

function isValidContentContainer(element: Record<string, unknown>): boolean {
	if (!Array.isArray(element.contents)) return false
	const contentIds = new Set<string>()
	for (const content of element.contents) {
		if (!isObject(content) || typeof content.contentId !== "string" || !content.contentId) {
			return false
		}
		if (Object.prototype.hasOwnProperty.call(content, "id") || "type" in content) return false
		if (contentIds.has(content.contentId)) return false
		contentIds.add(content.contentId)
	}

	const activeContentId = element.activeContentId
	const mainContentId = element.mainContentId
	if (element.contents.length === 0) {
		return activeContentId === null && mainContentId === null
	}
	if (typeof activeContentId !== "string" || !contentIds.has(activeContentId)) return false
	if (typeof mainContentId !== "string" || !contentIds.has(mainContentId)) {
		return false
	}
	return true
}

const BASE_ELEMENT_FIELDS = new Set([
	"id",
	"name",
	"type",
	"visible",
	"locked",
	"opacity",
	"x",
	"y",
	"width",
	"height",
	"scaleX",
	"scaleY",
	"zIndex",
	"interactionConfig",
	"contents",
	"activeContentId",
	"mainContentId",
])

function hasOnlyAllowedFields(record: Record<string, unknown>, fields: Set<string>): boolean {
	return Object.keys(record).every((field) => fields.has(field))
}

function isValidTextContent(content: Record<string, unknown>): boolean {
	if (content.content !== undefined && !Array.isArray(content.content)) return false
	return content.defaultStyle === undefined || isObject(content.defaultStyle)
}

function isValidShapeContent(content: Record<string, unknown>, type: string): boolean {
	for (const field of ["fill", "stroke"]) {
		if (!isOptionalString(content[field])) return false
	}
	if (content.strokeWidth !== undefined && !isFiniteNumber(content.strokeWidth)) return false
	if (content.cornerRadius !== undefined && !isFiniteNumber(content.cornerRadius)) return false
	if (type === ElementTypeEnum.Star) {
		if (content.sides !== undefined && !isFiniteNumber(content.sides)) return false
		if (content.innerRadiusRatio !== undefined && !isFiniteNumber(content.innerRadiusRatio)) {
			return false
		}
	}
	return true
}

function isValidStoryboardContent(content: Record<string, unknown>): boolean {
	if (content.generationConfig !== undefined && !isObject(content.generationConfig)) return false
	if (content.shots === undefined) return true
	if (!Array.isArray(content.shots)) return false
	const ids = new Set<string>()
	const outputElementIds = new Set<string>()
	for (const shot of content.shots) {
		if (!isObject(shot) || typeof shot.id !== "string" || ids.has(shot.id)) return false
		if (!hasOnlyAllowedFields(shot, new Set(["id", "description", "outputImageElementId"]))) {
			return false
		}
		if (typeof shot.description !== "string") return false
		if (shot.outputImageElementId !== undefined) {
			if (
				typeof shot.outputImageElementId !== "string" ||
				outputElementIds.has(shot.outputImageElementId)
			) {
				return false
			}
			outputElementIds.add(shot.outputImageElementId)
		}
		ids.add(shot.id)
	}
	return true
}

function isValidVideoEditContent(content: Record<string, unknown>): boolean {
	if (!Array.isArray(content.videoSequence) || !Array.isArray(content.audioSequence)) return false
	for (const sequence of [content.videoSequence, content.audioSequence]) {
		if (sequence.some((id) => typeof id !== "string" || !id)) return false
		if (new Set(sequence).size !== sequence.length) return false
	}
	if (content.output === undefined) return true
	if (!isObject(content.output)) return false
	const output = content.output
	return ["aspectRatio", "resolution", "format"].every((field) => isOptionalString(output[field]))
}

function isValidElementContent(content: Record<string, unknown>, type: string): boolean {
	const allowedFields = new Set(["contentId", ...getElementContentFields(type)])
	if (!hasOnlyAllowedFields(content, allowedFields)) return false
	if (!isOptionalString(content.src)) return false
	if (!isOptionalString(content.status)) return false
	if (!isOptionalString(content.errorMessage)) return false
	if (content.crop !== undefined && !isValidCropConfig(content.crop)) return false

	switch (type) {
		case ElementTypeEnum.Text:
			return isValidTextContent(content)
		case ElementTypeEnum.Rectangle:
		case ElementTypeEnum.Ellipse:
		case ElementTypeEnum.Triangle:
		case ElementTypeEnum.Star:
			return isValidShapeContent(content, type)
		case ElementTypeEnum.Storyboard:
			return isValidStoryboardContent(content)
		case ElementTypeEnum.VideoEdit:
			return isValidVideoEditContent(content)
		default:
			return true
	}
}

/** 验证是否为标准 v3 Element。 */
export function isValidElementData(data: unknown): data is LayerElement {
	if (!isObject(data)) return false
	if (typeof data.id !== "string" || !data.id) return false
	if (typeof data.type !== "string") return false
	if (!(Object.values(ElementTypeEnum) as string[]).includes(data.type)) return false

	for (const field of ["x", "y", "width", "height", "scaleX", "scaleY", "zIndex", "opacity"]) {
		if (data[field] !== undefined && !isFiniteNumber(data[field])) return false
	}
	for (const field of ["visible", "locked"]) {
		if (data[field] !== undefined && typeof data[field] !== "boolean") return false
	}
	if (!isOptionalString(data.name)) return false
	if (data.interactionConfig !== undefined && !isObject(data.interactionConfig)) return false
	const allowedElementFields = new Set(BASE_ELEMENT_FIELDS)
	if (data.type === ElementTypeEnum.Frame || data.type === ElementTypeEnum.Group) {
		allowedElementFields.add("children")
	}
	if (!hasOnlyAllowedFields(data, allowedElementFields)) return false
	for (const field of getElementContentFields(data.type)) {
		if (Object.prototype.hasOwnProperty.call(data, field)) return false
	}
	if (!isValidContentContainer(data)) return false
	for (const content of data.contents as Record<string, unknown>[]) {
		if (!isValidElementContent(content, data.type)) return false
	}

	if (data.type === ElementTypeEnum.Frame || data.type === ElementTypeEnum.Group) {
		if (data.children !== undefined && !Array.isArray(data.children)) return false
		if (
			Array.isArray(data.children) &&
			data.children.some((child) => !isValidElementData(child))
		) {
			return false
		}
	}
	return true
}

export function validateElementData(data: unknown): asserts data is LayerElement {
	if (!isValidElementData(data))
		throw new Error(`Invalid v3 element data ${JSON.stringify(data)}`)
}
