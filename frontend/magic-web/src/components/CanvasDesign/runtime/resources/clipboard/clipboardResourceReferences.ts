import type { ImageElement, LayerElement, VideoElement } from "../../document/types"
import { ElementTypeEnum } from "../../document/types"
import {
	toWeakCanvasResourcePath,
	stripCurrentDirectoryPrefix,
} from "../../shared/path/canvasResourcePath"

export interface ClipboardResourceReference {
	path: string
	isSelfReferenceOnly?: boolean
}

type MutableRecord = Record<string, unknown>

const REMOTE_OR_SPECIAL_PATH_PATTERN =
	/^(https?:|data:|blob:|file:|mailto:|tel:|about:|javascript:)/i

function asRecord(value: unknown): MutableRecord | null {
	return value && typeof value === "object" ? (value as MutableRecord) : null
}

function normalizeResourcePath(value: unknown): string | null {
	if (typeof value !== "string") return null
	const path = value.trim()
	if (!path || REMOTE_OR_SPECIAL_PATH_PATTERN.test(path)) return null
	return path
}

export function getClipboardResourcePathKey(value: unknown): string | null {
	const path = normalizeResourcePath(value)
	if (!path) return null
	return stripCurrentDirectoryPrefix(toWeakCanvasResourcePath(path))
}

function addPath(
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
	value: unknown,
	ownerSourcePath?: string | null,
): void {
	const path = normalizeResourcePath(value)
	if (!path) return

	const pathKey = getClipboardResourcePathKey(path)
	if (!pathKey) return

	const isSelfReference = getClipboardResourcePathKey(ownerSourcePath) === pathKey
	const existing = seen.get(pathKey)
	if (existing) {
		if (!isSelfReference) {
			existing.isSelfReferenceOnly = false
			existing.path = path
		}
		return
	}

	const ref: ClipboardResourceReference = {
		path,
		isSelfReferenceOnly: isSelfReference,
	}
	seen.set(pathKey, ref)
	refs.push(ref)
}

function collectPathArray(
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
	value: unknown,
	ownerSourcePath?: string | null,
): void {
	if (!Array.isArray(value)) return
	for (const item of value) {
		addPath(refs, seen, item, ownerSourcePath)
	}
}

function collectPathFieldArray(
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
	value: unknown,
	field: string,
	ownerSourcePath?: string | null,
): void {
	if (!Array.isArray(value)) return
	for (const item of value) {
		addPath(refs, seen, asRecord(item)?.[field], ownerSourcePath)
	}
}

function collectImageResourceReferences(
	element: ImageElement,
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
): void {
	const ownerSourcePath = normalizeResourcePath(element.src)
	const generateImageRequest = asRecord(element.generateImageRequest)
	if (generateImageRequest) {
		collectPathArray(refs, seen, generateImageRequest.reference_images, ownerSourcePath)
		collectPathFieldArray(
			refs,
			seen,
			generateImageRequest.reference_image_options,
			"path",
			ownerSourcePath,
		)
	}

	const imageGenerationTaskMeta = asRecord(element.imageGenerationTaskMeta)
	if (imageGenerationTaskMeta) {
		addPath(refs, seen, imageGenerationTaskMeta.file_path, ownerSourcePath)
		addPath(refs, seen, imageGenerationTaskMeta.canvas_path, ownerSourcePath)
		addPath(refs, seen, imageGenerationTaskMeta.mask_path, ownerSourcePath)
		addPath(refs, seen, imageGenerationTaskMeta.mark_path, ownerSourcePath)
		collectPathFieldArray(
			refs,
			seen,
			imageGenerationTaskMeta.reference_image_options,
			"path",
			ownerSourcePath,
		)
	}

	const generateHightImageRequest = asRecord(element.generateHightImageRequest)
	if (generateHightImageRequest) {
		addPath(refs, seen, generateHightImageRequest.file_path, ownerSourcePath)
		collectPathFieldArray(
			refs,
			seen,
			generateHightImageRequest.reference_image_options,
			"path",
			ownerSourcePath,
		)
	}
}

function collectVideoResourceReferences(
	element: VideoElement,
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
): void {
	const ownerSourcePath = normalizeResourcePath(element.src)
	const generateVideoRequest = asRecord(element.generateVideoRequest)
	const inputs = asRecord(generateVideoRequest?.inputs)
	if (!inputs) return

	collectPathFieldArray(refs, seen, inputs.frames, "uri", ownerSourcePath)
	collectPathFieldArray(refs, seen, inputs.reference_images, "uri", ownerSourcePath)
	collectPathFieldArray(refs, seen, inputs.reference_videos, "uri", ownerSourcePath)
	collectPathFieldArray(refs, seen, inputs.reference_audios, "uri", ownerSourcePath)
	collectPathFieldArray(refs, seen, inputs.audio, "uri", ownerSourcePath)
	addPath(refs, seen, asRecord(inputs.video)?.uri, ownerSourcePath)
	addPath(refs, seen, asRecord(inputs.mask)?.uri, ownerSourcePath)
}

function collectElementReferences(
	element: LayerElement,
	refs: ClipboardResourceReference[],
	seen: Map<string, ClipboardResourceReference>,
): void {
	if (element.type === ElementTypeEnum.Image) {
		collectImageResourceReferences(element, refs, seen)
	}

	if (element.type === ElementTypeEnum.Video) {
		collectVideoResourceReferences(element, refs, seen)
	}

	if ("children" in element && Array.isArray(element.children)) {
		for (const child of element.children) {
			collectElementReferences(child, refs, seen)
		}
	}
}

export function collectElementResourceReferences(
	elements: LayerElement[],
): ClipboardResourceReference[] {
	const refs: ClipboardResourceReference[] = []
	const seen = new Map<string, ClipboardResourceReference>()
	for (const element of elements) {
		collectElementReferences(element, refs, seen)
	}
	return refs
}

function resolveReplacement(value: unknown, pathMap: ReadonlyMap<string, string>): string | null {
	const path = normalizeResourcePath(value)
	if (!path) return null
	const exactReplacement = pathMap.get(path)
	if (exactReplacement) return exactReplacement

	const pathKey = getClipboardResourcePathKey(path)
	if (!pathKey) return null
	for (const [sourcePath, replacement] of pathMap.entries()) {
		if (getClipboardResourcePathKey(sourcePath) === pathKey) {
			return replacement
		}
	}
	return null
}

function rewritePathField(
	target: MutableRecord | null,
	field: string,
	pathMap: ReadonlyMap<string, string>,
): boolean {
	if (!target) return false
	const replacement = resolveReplacement(target[field], pathMap)
	if (!replacement) return false
	target[field] = replacement
	return true
}

function rewritePathArray(value: unknown, pathMap: ReadonlyMap<string, string>): boolean {
	if (!Array.isArray(value)) return false

	let hasChanged = false
	for (let index = 0; index < value.length; index += 1) {
		const replacement = resolveReplacement(value[index], pathMap)
		if (!replacement) continue
		value[index] = replacement
		hasChanged = true
	}
	return hasChanged
}

function rewritePathFieldArray(
	value: unknown,
	field: string,
	pathMap: ReadonlyMap<string, string>,
): boolean {
	if (!Array.isArray(value)) return false

	let hasChanged = false
	for (const item of value) {
		if (rewritePathField(asRecord(item), field, pathMap)) {
			hasChanged = true
		}
	}
	return hasChanged
}

function rewriteImageResourceReferences(
	element: ImageElement,
	pathMap: ReadonlyMap<string, string>,
): boolean {
	let hasChanged = false
	const generateImageRequest = asRecord(element.generateImageRequest)
	if (generateImageRequest) {
		if (rewritePathArray(generateImageRequest.reference_images, pathMap)) hasChanged = true
		if (rewritePathFieldArray(generateImageRequest.reference_image_options, "path", pathMap)) {
			hasChanged = true
		}
		delete generateImageRequest.project_id
		delete generateImageRequest.file_dir
		delete generateImageRequest.file_name
	}

	const imageGenerationTaskMeta = asRecord(element.imageGenerationTaskMeta)
	if (imageGenerationTaskMeta) {
		if (rewritePathField(imageGenerationTaskMeta, "file_path", pathMap)) hasChanged = true
		if (rewritePathField(imageGenerationTaskMeta, "canvas_path", pathMap)) hasChanged = true
		if (rewritePathField(imageGenerationTaskMeta, "mask_path", pathMap)) hasChanged = true
		if (rewritePathField(imageGenerationTaskMeta, "mark_path", pathMap)) hasChanged = true
		if (
			rewritePathFieldArray(imageGenerationTaskMeta.reference_image_options, "path", pathMap)
		) {
			hasChanged = true
		}
		delete imageGenerationTaskMeta.project_id
		delete imageGenerationTaskMeta.file_dir
		delete imageGenerationTaskMeta.file_name
	}

	const generateHightImageRequest = asRecord(element.generateHightImageRequest)
	if (generateHightImageRequest) {
		if (rewritePathField(generateHightImageRequest, "file_path", pathMap)) hasChanged = true
		if (
			rewritePathFieldArray(
				generateHightImageRequest.reference_image_options,
				"path",
				pathMap,
			)
		) {
			hasChanged = true
		}
		delete generateHightImageRequest.project_id
		delete generateHightImageRequest.file_dir
		delete generateHightImageRequest.file_name
	}

	return hasChanged
}

function rewriteVideoResourceReferences(
	element: VideoElement,
	pathMap: ReadonlyMap<string, string>,
): boolean {
	let hasChanged = false
	const generateVideoRequest = asRecord(element.generateVideoRequest)
	const inputs = asRecord(generateVideoRequest?.inputs)
	if (inputs) {
		if (rewritePathFieldArray(inputs.frames, "uri", pathMap)) hasChanged = true
		if (rewritePathFieldArray(inputs.reference_images, "uri", pathMap)) hasChanged = true
		if (rewritePathFieldArray(inputs.reference_videos, "uri", pathMap)) hasChanged = true
		if (rewritePathFieldArray(inputs.reference_audios, "uri", pathMap)) hasChanged = true
		if (rewritePathFieldArray(inputs.audio, "uri", pathMap)) hasChanged = true
		if (rewritePathField(asRecord(inputs.video), "uri", pathMap)) hasChanged = true
		if (rewritePathField(asRecord(inputs.mask), "uri", pathMap)) hasChanged = true
	}

	if (generateVideoRequest) {
		delete generateVideoRequest.project_id
		delete generateVideoRequest.file_dir
		delete generateVideoRequest.file_name
	}

	return hasChanged
}

export function rewriteElementResourceReferences(
	element: LayerElement,
	pathMap: ReadonlyMap<string, string>,
): boolean {
	let hasChanged = false

	if (element.type === ElementTypeEnum.Image) {
		hasChanged = rewriteImageResourceReferences(element, pathMap) || hasChanged
	}

	if (element.type === ElementTypeEnum.Video) {
		hasChanged = rewriteVideoResourceReferences(element, pathMap) || hasChanged
	}

	if ("children" in element && Array.isArray(element.children)) {
		for (const child of element.children) {
			hasChanged = rewriteElementResourceReferences(child, pathMap) || hasChanged
		}
	}

	return hasChanged
}
