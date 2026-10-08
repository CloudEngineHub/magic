import type { ResolveCanvasResourceReference } from "../../../public/resource-reference"
import type { GenerateVideoRequest, VideoModelItem } from "../../../public/magic-types"
import type { VideoElementContent } from "../../document/types"
import { areCanvasResourceReferencesSame } from "../../shared/path/canvasResourcePath"

export const VIDEO_DRAFT_FINAL_RESOLUTION = "1080p"

type DraftVideoContent = VideoElementContent & {
	src: string
	generateVideoRequest: GenerateVideoRequest & { model_id: string }
}

export function isDraftVideoContent(
	content: VideoElementContent | null | undefined,
): content is DraftVideoContent {
	return Boolean(
		content?.src &&
		content.generateVideoRequest?.model_id &&
		content.generateVideoRequest.generation?.draft === true,
	)
}

export function isDraftTaskVideoRequest(request: GenerateVideoRequest | null | undefined): boolean {
	return request?.input_mode === "draft_task"
}

export function supportsVideoDraftFinal(
	model: VideoModelItem | undefined,
	modelId: string | undefined,
): boolean {
	if (!model || !modelId || model.model_id !== modelId) return false
	const mode = model.video_generation_config?.input_modes?.draft_task
	if (!mode?.supported_fields?.includes("draft_task")) return false
	const resolutions =
		mode.generation_constraints?.resolutions ??
		model.video_generation_config?.generation?.resolutions ??
		[]
	return resolutions.includes(VIDEO_DRAFT_FINAL_RESOLUTION)
}

export function buildVideoDraftFinalRequest(
	content: VideoElementContent,
	videoId: string,
): GenerateVideoRequest | null {
	if (!isDraftVideoContent(content)) return null
	const sourceRequest = content.generateVideoRequest
	const sourceVideoId = sourceRequest.video_id?.trim()
	const sourceUri = content.src?.trim()
	if (!sourceVideoId && !sourceUri) return null

	return {
		video_id: videoId,
		model_id: sourceRequest.model_id,
		input_mode: "draft_task",
		task: "generate",
		inputs: {
			draft_task: sourceVideoId ? { video_id: sourceVideoId } : { uri: sourceUri },
		},
		generation: { resolution: VIDEO_DRAFT_FINAL_RESOLUTION },
	}
}

export function isVideoDraftFinalRequestForSource(
	request: GenerateVideoRequest | null | undefined,
	sourceContent: VideoElementContent,
	resolveResourceReference?: ResolveCanvasResourceReference,
): boolean {
	if (!isDraftTaskVideoRequest(request)) return false
	const targetReference = request?.inputs?.draft_task
	const sourceVideoId = sourceContent.generateVideoRequest?.video_id?.trim()
	const targetVideoId = targetReference?.video_id?.trim()
	if (sourceVideoId) return Boolean(targetVideoId && targetVideoId === sourceVideoId)

	const sourceUri = sourceContent.src?.trim()
	const targetUri = targetReference?.uri?.trim()
	if (!sourceUri || !targetUri) return false
	return areCanvasResourceReferencesSame(sourceUri, targetUri, resolveResourceReference)
}
