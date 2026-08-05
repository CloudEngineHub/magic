import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

/** 模型目录模式可以独立于消息发送模式，未指定时保持原有行为。 */
export function resolveModelTopicMode(
	topicMode?: TopicMode,
	modelTopicMode?: TopicMode,
): TopicMode | undefined {
	return modelTopicMode ?? topicMode
}
