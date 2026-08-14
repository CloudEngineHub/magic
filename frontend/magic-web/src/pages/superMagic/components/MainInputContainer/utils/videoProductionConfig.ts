import type { JSONContent } from "@tiptap/core"

export const VIDEO_PRODUCTION_AGENT_CODE = "video-production"
export const VIDEO_PRODUCTION_SUFFIX_SOURCE = "video-production-config"

export interface VideoProductionContextLike {
	topicMode?: string
	agentCode?: string | null
	selectedTopic?: { agent_code?: string | null } | null
}

export function isVideoProductionContext(context?: VideoProductionContextLike): boolean {
	if (!context) return false
	return [context.topicMode, context.agentCode, context.selectedTopic?.agent_code].some(
		(value) => value === VIDEO_PRODUCTION_AGENT_CODE,
	)
}

export interface VideoProductionPresetContentInput {
	generationMode?: string
	aspectRatio?: string
	durationSeconds?: number
	resolution?: string
	showAspectRatio?: boolean
	showDuration?: boolean
	showResolution?: boolean
	labels?: {
		generation?: string
		aspectRatio?: string
		duration?: string
		resolution?: string
	}
}

/** Build the selected video configuration as a prompt suffix, following PPT's send path. */
export function buildVideoProductionPresetContent(
	input: VideoProductionPresetContentInput,
): JSONContent | undefined {
	const labels = {
		generation: "generation",
		aspectRatio: "aspectRatio",
		duration: "duration",
		resolution: "resolution",
		...input.labels,
	}
	const segments = [
		...(input.generationMode ? [`${labels.generation}: ${input.generationMode}`] : []),
		...(input.showAspectRatio && input.aspectRatio
			? [`${labels.aspectRatio}: ${input.aspectRatio}`]
			: []),
		...(input.showDuration && typeof input.durationSeconds === "number"
			? [`${labels.duration}: ${input.durationSeconds}s`]
			: []),
		...(input.showResolution && input.resolution
			? [`${labels.resolution}: ${input.resolution}`]
			: []),
	]

	if (segments.length === 0) return undefined

	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: `${segments.join("; ")}.` }],
			},
		],
	}
}
