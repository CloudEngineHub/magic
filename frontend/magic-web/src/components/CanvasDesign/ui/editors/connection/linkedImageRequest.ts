import type { GenerateImageRequest, ReferenceImageOptions } from "../../../public/magic-types"
import { buildReferenceImageOptions } from "../../../runtime/resources/image/imageCropUtils"
import {
	mergeLinkedMediaReferences,
	type LinkedEditorInputsResolution,
	type LinkedEditorMediaReference,
} from "./linkedEditorInputs"
import { composePromptWithLinkedText } from "./linkedTextPrompt"

function buildLinkedReferenceImageOptions(
	references: LinkedEditorMediaReference[],
): ReferenceImageOptions | undefined {
	const options = references.flatMap(
		(reference) =>
			buildReferenceImageOptions({
				filePath: reference.path,
				crop: reference.sourceCrop,
			}) ?? [],
	)
	return options.length > 0 ? options : undefined
}

function mergeReferenceImageOptions(
	...groups: Array<ReferenceImageOptions | undefined>
): ReferenceImageOptions | undefined {
	const merged: ReferenceImageOptions = []
	const seenPathSet = new Set<string>()

	for (const group of groups) {
		for (const option of group ?? []) {
			if (!option.path || seenPathSet.has(option.path)) continue
			seenPathSet.add(option.path)
			merged.push(option)
		}
	}

	return merged.length > 0 ? merged : undefined
}

export function buildImageRequestWithLinkedEditorInputs(
	request: GenerateImageRequest,
	linkedInputs: Pick<LinkedEditorInputsResolution, "activeMediaReferences" | "textPrompt">,
	promptFallback = "",
): GenerateImageRequest {
	const mergedImageReferences = mergeLinkedMediaReferences(
		(request.reference_images ?? []).map((path) => ({
			kind: "image" as const,
			path,
		})),
		linkedInputs.activeMediaReferences,
	).filter((reference) => reference.kind === "image")
	const mergedReferenceImages = mergedImageReferences.map((reference) => reference.path)
	const referenceImageOptions = mergeReferenceImageOptions(
		request.reference_image_options,
		buildLinkedReferenceImageOptions(mergedImageReferences),
	)

	return {
		...request,
		prompt: composePromptWithLinkedText(
			linkedInputs.textPrompt,
			request.prompt || promptFallback,
		),
		reference_images: mergedReferenceImages.length > 0 ? mergedReferenceImages : undefined,
		reference_image_options: referenceImageOptions,
	}
}
