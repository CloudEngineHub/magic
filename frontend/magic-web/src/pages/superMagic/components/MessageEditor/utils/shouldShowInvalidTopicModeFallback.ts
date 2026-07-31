import type { ComponentType } from "react"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { InvalidModeFallbackProps } from "../components/TopicInvalidModeFallback"

export function shouldShowInvalidTopicModeFallback({
	invalidModeFallback,
	selectedTopic,
	topicMode,
	messagesLength = 0,
}: {
	invalidModeFallback?: ComponentType<InvalidModeFallbackProps>
	selectedTopic?: Topic | null
	topicMode?: TopicMode
	messagesLength?: number
}) {
	if (!invalidModeFallback || !selectedTopic) return false
	// Empty topics recover to the default employee instead of blocking input.
	if (messagesLength === 0) return false

	return !superMagicModeService.isModeValid(topicMode as TopicMode, selectedTopic.agent_code)
}
