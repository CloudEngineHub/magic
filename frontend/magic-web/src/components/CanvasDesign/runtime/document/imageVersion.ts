import { ImageGenerationTaskTypeMap } from "../../public/magic-types"
import type { GenerateHightImageRequest, ImageGenerationTaskMeta } from "../../public/magic-types"
import { generateUUID } from "../shared/ids"
import type { ImageElement, ImageElementV1, ImageElementV2, ImageElementVersion } from "./types"

export const IMAGE_DSL_VERSION = 2 as const
/** 仅控制重新编辑/再次生成是否走同元素版本迭代；V2 读取兼容始终开启。 */
export const ENABLE_IMAGE_VERSION_ITERATION = true

export type ImageVersionFields = Omit<ImageElementVersion, "id">

const VERSION_FIELD_NAMES = [
	"src",
	"status",
	"errorMessage",
	"generateImageRequest",
	"imageGenerationTaskMeta",
	"crop",
] as const satisfies ReadonlyArray<keyof ImageVersionFields>

export function isImageElementV2(element: ImageElement): element is ImageElementV2 {
	return "imageDslVersion" in element && element.imageDslVersion === IMAGE_DSL_VERSION
}

export function getImageElementVersions(element: ImageElement): ImageElementVersion[] {
	if (isImageElementV2(element)) {
		return element.versions
	}
	return [wrapImageElementV1(element)]
}

export function getActiveImageVersion(element: ImageElement): ImageElementVersion {
	if (!isImageElementV2(element)) return wrapImageElementV1(element)
	return (
		element.versions.find((version) => version.id === element.activeVersionId) ??
		element.versions[0]
	)
}

export function getMainImageVersion(element: ImageElement): ImageElementVersion {
	if (!isImageElementV2(element)) return wrapImageElementV1(element)
	return (
		element.versions.find((version) => version.id === element.mainVersionId) ??
		element.versions[0]
	)
}

export function getImageVersionById(
	element: ImageElement,
	versionId?: string,
): ImageElementVersion | undefined {
	if (!isImageElementV2(element)) return versionId ? undefined : wrapImageElementV1(element)
	const resolvedVersionId = versionId ?? element.activeVersionId
	return element.versions.find((version) => version.id === resolvedVersionId)
}

export function getActiveImageVersionId(element: ImageElement): string | undefined {
	return isImageElementV2(element) ? element.activeVersionId : undefined
}

export function hasProcessingImageVersion(element: ImageElement): boolean {
	return getImageElementVersions(element).some((version) => version.status === "processing")
}

export function createImageVersionId(): string {
	return `image-version-${generateUUID()}`
}

/**
 * V1 只在服务端确认新任务后迁移。调用方必须把此函数和新版本追加放在同一次元素更新中，
 * 避免先落下一个没有新任务的空 V2 文档状态。
 */
export function migrateImageElementV1(
	element: ImageElementV1,
	firstVersionId = createImageVersionId(),
): ImageElementV2 {
	const {
		src,
		status,
		errorMessage,
		generateImageRequest,
		imageGenerationTaskMeta,
		generateHightImageRequest,
		crop,
		...base
	} = element
	const firstVersion: ImageElementVersion = {
		id: firstVersionId,
		src,
		status,
		errorMessage,
		generateImageRequest,
		imageGenerationTaskMeta:
			imageGenerationTaskMeta ?? normalizeLegacyHighImageTaskMeta(generateHightImageRequest),
		crop,
	}

	return {
		...base,
		type: element.type,
		imageDslVersion: IMAGE_DSL_VERSION,
		activeVersionId: firstVersionId,
		mainVersionId: firstVersionId,
		versions: [stripUndefinedVersionFields(firstVersion)],
	}
}

export function appendImageVersion(
	element: ImageElement,
	version: ImageElementVersion,
): ImageElementV2 {
	const v2 = isImageElementV2(element) ? element : migrateImageElementV1(element)
	if (v2.versions.some((item) => item.id === version.id)) {
		throw new Error(`Duplicate image version ${version.id}`)
	}
	return {
		...v2,
		versions: [...v2.versions, stripUndefinedVersionFields(version)],
	}
}

export function updateImageVersion(
	element: ImageElement,
	versionId: string | undefined,
	patch: Partial<ImageVersionFields>,
): ImageElement {
	if (!isImageElementV2(element)) {
		if (versionId) return element
		return applyVersionFieldsToV1(element, patch)
	}
	const targetId = versionId ?? element.activeVersionId
	let found = false
	const versions = element.versions.map((version) => {
		if (version.id !== targetId) return version
		found = true
		return stripUndefinedVersionFields({ ...version, ...patch })
	})
	return found ? { ...element, versions } : element
}

export function switchActiveImageVersion(
	element: ImageElementV2,
	versionId: string,
): ImageElementV2 {
	if (!element.versions.some((version) => version.id === versionId)) return element
	if (element.activeVersionId === versionId) return element
	return { ...element, activeVersionId: versionId }
}

export function setMainImageVersion(element: ImageElementV2, versionId: string): ImageElementV2 {
	const target = element.versions.find((version) => version.id === versionId)
	if (!target?.src || target.status !== "completed") return element
	if (element.mainVersionId === versionId) return element
	return { ...element, mainVersionId: versionId }
}

export interface DeleteImageVersionResult {
	element: ImageElementV2
	deletedVersion: ImageElementVersion
}

export function deleteActiveImageVersion(element: ImageElementV2): DeleteImageVersionResult | null {
	if (element.versions.length <= 1) return null
	const deletedIndex = element.versions.findIndex(
		(version) => version.id === element.activeVersionId,
	)
	if (deletedIndex < 0) return null

	const deletedVersion = element.versions[deletedIndex]
	const versions = element.versions.filter((version) => version.id !== deletedVersion.id)
	const activeVersion = versions[Math.max(0, deletedIndex - 1)] ?? versions[0]
	let mainVersionId = element.mainVersionId
	if (mainVersionId === deletedVersion.id) {
		mainVersionId = findNearestCompletedVersionId(versions, deletedIndex) ?? activeVersion.id
	}

	return {
		deletedVersion,
		element: {
			...element,
			versions,
			activeVersionId: activeVersion.id,
			mainVersionId,
		},
	}
}

export function replaceImageVersionFields(
	element: ImageElement,
	fields: ImageVersionFields,
): ImageElement {
	const cleared = Object.fromEntries(VERSION_FIELD_NAMES.map((name) => [name, undefined]))
	return updateImageVersion(element, getActiveImageVersionId(element), {
		...cleared,
		...fields,
	} as Partial<ImageVersionFields> & Record<string, unknown>)
}

function wrapImageElementV1(element: ImageElementV1): ImageElementVersion {
	return stripUndefinedVersionFields({
		id: element.id,
		src: element.src,
		status: element.status,
		errorMessage: element.errorMessage,
		generateImageRequest: element.generateImageRequest,
		imageGenerationTaskMeta:
			element.imageGenerationTaskMeta ??
			normalizeLegacyHighImageTaskMeta(element.generateHightImageRequest),
		crop: element.crop,
	})
}

function applyVersionFieldsToV1(
	element: ImageElementV1,
	patch: Partial<ImageVersionFields>,
): ImageElementV1 {
	const next: ImageElementV1 = { ...element }
	for (const field of VERSION_FIELD_NAMES) {
		if (!(field in patch)) continue
		const value = patch[field]
		if (value === undefined) delete (next as unknown as Record<string, unknown>)[field]
		else Object.assign(next, { [field]: value })
	}
	return next
}

function stripUndefinedVersionFields(version: ImageElementVersion): ImageElementVersion {
	const result: ImageElementVersion = { id: version.id }
	for (const field of VERSION_FIELD_NAMES) {
		const value = version[field]
		if (value !== undefined) Object.assign(result, { [field]: value })
	}
	return result
}

function normalizeLegacyHighImageTaskMeta(
	request?: GenerateHightImageRequest,
): ImageGenerationTaskMeta | undefined {
	if (!request) return undefined
	return {
		type: ImageGenerationTaskTypeMap.High,
		image_id: request.image_id,
		file_path: request.file_path,
		size: request.size,
		reference_image_options: request.reference_image_options,
	}
}

function findNearestCompletedVersionId(
	versions: ImageElementVersion[],
	deletedIndex: number,
): string | undefined {
	for (let distance = 1; distance <= versions.length; distance += 1) {
		const previous = versions[deletedIndex - distance]
		if (previous?.status === "completed" && previous.src) return previous.id
		const next = versions[deletedIndex - 1 + distance]
		if (next?.status === "completed" && next.src) return next.id
	}
	return undefined
}
