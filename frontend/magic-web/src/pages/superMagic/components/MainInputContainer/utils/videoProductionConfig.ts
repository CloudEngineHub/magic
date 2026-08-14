export const VIDEO_PRODUCTION_AGENT_CODE = "video-production"

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
