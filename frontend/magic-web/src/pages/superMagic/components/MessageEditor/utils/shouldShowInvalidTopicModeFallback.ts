import type { ComponentType } from "react"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { InvalidModeFallbackProps } from "../components/TopicInvalidModeFallback"

export function hasSavedTopicMode(selectedTopic?: Pick<Topic, "topic_mode"> | null) {
	return Boolean(selectedTopic?.topic_mode)
}

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
	if (!superMagicModeService.isModeAvailabilityResolved) return false

	const savedTopicMode = hasSavedTopicMode(selectedTopic) ? selectedTopic.topic_mode : undefined
	// 只有未保存模式的空话题可以自动采用默认模式；已保存模式失效时必须提示用户。
	if (messagesLength === 0 && !savedTopicMode) return false

	return !superMagicModeService.isModeValid(
		(savedTopicMode ?? topicMode) as TopicMode,
		selectedTopic.agent_code,
	)
}
