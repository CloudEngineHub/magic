import SuperMagicService from "@/pages/superMagic/services"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import { extractChatTopicIdFromExecuteResult } from "./parseScheduledTaskExecuteResponse"

export { extractChatTopicIdFromExecuteResult }

function findTopicByChatTopicId(chatTopicId: string, topics: Topic[]): Topic | undefined {
	return topics.find((topic) => topic.chat_topic_id === chatTopicId)
}

export async function resolveTopicByChatTopicId(chatTopicId: string): Promise<Topic | null> {
	const cachedTopic = findTopicByChatTopicId(chatTopicId, topicStore.topics)
	if (cachedTopic) return cachedTopic

	const projectId = projectStore.selectedProject?.id
	if (!projectId) return null

	const topics = await SuperMagicService.topic.fetchTopics({
		projectId,
		isAutoSelect: false,
	})

	return findTopicByChatTopicId(chatTopicId, topics) ?? null
}

export async function switchToTopicByChatTopicId(chatTopicId: string): Promise<boolean> {
	const topic = await resolveTopicByChatTopicId(chatTopicId)
	if (!topic) return false

	SuperMagicService.switchTopic(topic)
	return true
}
