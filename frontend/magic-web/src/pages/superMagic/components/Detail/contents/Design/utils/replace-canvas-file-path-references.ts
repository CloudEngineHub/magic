import type { CanvasDocument, LayerElement } from "@/components/CanvasDesign/runtime/document/types"
import { type ImageGenerationTaskMeta } from "@/components/CanvasDesign/public/magic-types"
import type { ResolveCanvasResourceReference } from "@/components/CanvasDesign/public/resource-reference"
import { isLegacyBareDesignResourcePath } from "./designPath"

interface ReplaceCanvasFilePathReferencesOptions {
	oldWorkspaceRelativePath: string
	newCanvasPath: string
	resolveResourceReference: ResolveCanvasResourceReference
}

interface PathReplacementContext {
	oldIdentity: string
	newCanvasPath: string
	resolveResourceReference: ResolveCanvasResourceReference
	unsafeReferenceFound: boolean
}

export interface CanvasFilePathReplacementResult {
	status: "replaced" | "unchanged" | "unsafe"
	canvasData: CanvasDocument
}

function asRecord(value: object): Record<string, unknown> {
	return value as unknown as Record<string, unknown>
}

function shouldReplacePath(value: unknown, context: PathReplacementContext): value is string {
	if (typeof value !== "string" || !value.trim()) return false
	const mode = isLegacyBareDesignResourcePath(value) ? "legacy-recovery" : "strict-current-canvas"

	const resolution = context.resolveResourceReference(
		{
			namespace: "canvas-storage",
			path: value,
			mode,
		},
		{ requireAttachment: true },
	)
	if (
		mode === "legacy-recovery" &&
		resolution.status !== "resolved" &&
		resolution.candidates.some((candidate) => `workspace:${candidate}` === context.oldIdentity)
	) {
		context.unsafeReferenceFound = true
	}
	return resolution.status === "resolved" && resolution.identity === context.oldIdentity
}

function replacePathField(
	target: Record<string, unknown>,
	key: string,
	context: PathReplacementContext,
): boolean {
	if (!shouldReplacePath(target[key], context)) {
		return false
	}

	target[key] = context.newCanvasPath
	return true
}

function replaceReferenceImageOptionsPaths(
	value: unknown,
	context: PathReplacementContext,
): boolean {
	if (!Array.isArray(value) || value.length === 0) return false

	let hasChanged = false
	for (const item of value) {
		if (!item || typeof item !== "object") continue
		if (replacePathField(item as Record<string, unknown>, "path", context)) {
			hasChanged = true
		}
	}

	return hasChanged
}

function replaceUriItems(value: unknown, context: PathReplacementContext): boolean {
	if (!Array.isArray(value) || value.length === 0) return false

	let hasChanged = false
	for (const item of value) {
		if (!item || typeof item !== "object") continue
		if (replacePathField(item as Record<string, unknown>, "uri", context)) {
			hasChanged = true
		}
	}

	return hasChanged
}

function replaceImageElementPaths(
	element: Record<string, unknown>,
	context: PathReplacementContext,
): boolean {
	let hasChanged = false

	if (replacePathField(element, "src", context)) {
		hasChanged = true
	}

	const generateImageRequest = element.generateImageRequest as
		| {
				reference_images?: string[]
				reference_image_options?: Array<{ path?: string }>
		  }
		| undefined

	if (generateImageRequest && typeof generateImageRequest === "object") {
		if (Array.isArray(generateImageRequest.reference_images)) {
			const nextReferenceImages = generateImageRequest.reference_images.map((path) => {
				if (!shouldReplacePath(path, context)) {
					return path
				}

				hasChanged = true
				return context.newCanvasPath
			})
			generateImageRequest.reference_images = nextReferenceImages
		}

		if (
			replaceReferenceImageOptionsPaths(generateImageRequest.reference_image_options, context)
		) {
			hasChanged = true
		}
	}

	const imageGenerationTaskMeta = element.imageGenerationTaskMeta as
		ImageGenerationTaskMeta | undefined
	if (imageGenerationTaskMeta && typeof imageGenerationTaskMeta === "object") {
		const imageGenerationTaskMetaRecord = asRecord(imageGenerationTaskMeta)

		if (replacePathField(imageGenerationTaskMetaRecord, "file_path", context)) {
			hasChanged = true
		}
		// canvas_path / mask_path / mark_path 属于 private upload，不随工作区附件重命名。
		if (
			replaceReferenceImageOptionsPaths(
				imageGenerationTaskMeta.reference_image_options,
				context,
			)
		) {
			hasChanged = true
		}
	}

	const generateHightImageRequest = element.generateHightImageRequest as
		| {
				file_path?: string
				reference_image_options?: Array<{ path?: string }>
		  }
		| undefined
	if (generateHightImageRequest && typeof generateHightImageRequest === "object") {
		if (
			replacePathField(
				generateHightImageRequest as Record<string, unknown>,
				"file_path",
				context,
			)
		) {
			hasChanged = true
		}
		if (
			replaceReferenceImageOptionsPaths(
				generateHightImageRequest.reference_image_options,
				context,
			)
		) {
			hasChanged = true
		}
	}

	return hasChanged
}

function replaceVideoElementPaths(
	element: Record<string, unknown>,
	context: PathReplacementContext,
): boolean {
	let hasChanged = false

	if (replacePathField(element, "src", context)) {
		hasChanged = true
	}

	const generateVideoRequest = element.generateVideoRequest as
		| {
				inputs?: {
					frames?: Array<{ uri?: string }>
					reference_images?: Array<{ uri?: string }>
					reference_videos?: Array<{ uri?: string }>
					reference_audios?: Array<{ uri?: string }>
					video?: { uri?: string }
					mask?: { uri?: string }
					audio?: Array<{ uri?: string }>
				}
		  }
		| undefined

	if (!generateVideoRequest || typeof generateVideoRequest !== "object") {
		return hasChanged
	}

	if (replaceUriItems(generateVideoRequest.inputs?.frames, context)) {
		hasChanged = true
	}
	if (replaceUriItems(generateVideoRequest.inputs?.reference_images, context)) {
		hasChanged = true
	}
	if (replaceUriItems(generateVideoRequest.inputs?.reference_videos, context)) {
		hasChanged = true
	}
	if (replaceUriItems(generateVideoRequest.inputs?.reference_audios, context)) {
		hasChanged = true
	}
	if (replaceUriItems(generateVideoRequest.inputs?.audio, context)) {
		hasChanged = true
	}
	if (
		replacePathField(
			(generateVideoRequest.inputs?.video ?? {}) as Record<string, unknown>,
			"uri",
			context,
		)
	) {
		hasChanged = true
	}
	if (
		replacePathField(
			(generateVideoRequest.inputs?.mask ?? {}) as Record<string, unknown>,
			"uri",
			context,
		)
	) {
		hasChanged = true
	}

	return hasChanged
}

function replaceElementPaths(element: LayerElement, context: PathReplacementContext): boolean {
	const elementRecord = element as unknown as Record<string, unknown>
	let hasChanged = false

	if (element.type === "image") {
		hasChanged = replaceImageElementPaths(elementRecord, context)
	}

	if (element.type === "video") {
		hasChanged = replaceVideoElementPaths(elementRecord, context)
	}

	if (element.type === "audio") {
		hasChanged = replacePathField(elementRecord, "src", context)
	}

	if ("children" in element && Array.isArray(element.children)) {
		for (const child of element.children) {
			if (replaceElementPaths(child, context)) {
				hasChanged = true
			}
		}
	}

	return hasChanged
}

export function getCanvasFilePathReplacementResult(
	canvasData: CanvasDocument,
	options: ReplaceCanvasFilePathReferencesOptions,
): CanvasFilePathReplacementResult {
	const { oldWorkspaceRelativePath, newCanvasPath, resolveResourceReference } = options
	if (!canvasData?.elements?.length || !oldWorkspaceRelativePath || !newCanvasPath) {
		return { status: "unchanged", canvasData }
	}
	const oldResolution = resolveResourceReference({
		namespace: "workspace-path",
		path: oldWorkspaceRelativePath,
	})
	if (oldResolution.status !== "resolved" || oldResolution.resourceKind !== "workspace-file") {
		return { status: "unchanged", canvasData }
	}
	const context: PathReplacementContext = {
		oldIdentity: oldResolution.identity,
		newCanvasPath,
		resolveResourceReference,
		unsafeReferenceFound: false,
	}

	const nextCanvasData = JSON.parse(JSON.stringify(canvasData)) as CanvasDocument
	const nextElements = nextCanvasData.elements
	let hasChanged = false

	if (!nextElements?.length) {
		return { status: "unchanged", canvasData }
	}

	for (const element of nextElements) {
		if (replaceElementPaths(element, context)) {
			hasChanged = true
		}
	}

	if (context.unsafeReferenceFound) return { status: "unsafe", canvasData }
	return hasChanged
		? { status: "replaced", canvasData: nextCanvasData }
		: { status: "unchanged", canvasData }
}

export function replaceCanvasFilePathReferences(
	canvasData: CanvasDocument,
	options: ReplaceCanvasFilePathReferencesOptions,
): CanvasDocument {
	return getCanvasFilePathReplacementResult(canvasData, options).canvasData
}
