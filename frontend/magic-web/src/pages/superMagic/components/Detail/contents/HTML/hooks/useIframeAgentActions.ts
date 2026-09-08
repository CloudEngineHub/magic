/**
 * useIframeAgentActions
 *
 * 封装 iframe agent 相关的业务逻辑：获取 agent 列表、创建话题并发送消息、在当前话题发送消息。
 * 返回值可直接传入 useIframeAgent。
 */

import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import {
	AgentType,
	type ProjectListItem,
	type Topic,
} from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { SuperMagicApi } from "@/apis"
import { topicStore, projectStore } from "@/pages/superMagic/stores/core"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { superMagicTopicModelService } from "@/services/superMagic/topicModel"
import type { AgentInfo, TiptapJSONContent } from "../iframe-api/types"
import { messageSendService } from "@/pages/superMagic/services/messageSendFlowService"
import {
	processMessageMentions,
	releaseHtmlScreenshotsAfterSend,
	resolveMessageSendContext,
} from "@/pages/superMagic/services/messageSendPreparation"
import { collectMentionItemsFromContent } from "@/pages/superMagic/components/MessageEditor/services/uploadMentionService"
import type { JSONContent } from "@/infrastructure/editors/tiptap/react"

export function useIframeAgentActions(
	projectId?: string,
	scopedTopicStore?: TopicStore,
	selectedProject?: ProjectListItem | null,
) {
	const getRuntimeProjectId = useMemoizedFn(() => projectId ?? projectStore.selectedProject?.id)
	const activeTopicStore = scopedTopicStore ?? topicStore
	const selectCreatedTopic = useMemoizedFn((topic: Topic) => {
		if (scopedTopicStore) {
			// 微应用页面使用独立会话 store，创建后同步列表和选中项，避免后续发送仍读取旧话题。
			scopedTopicStore.setTopics([
				topic,
				...scopedTopicStore.topics.filter((item) => item.id !== topic.id),
			])
		}
		activeTopicStore.setSelectedTopic(topic)
	})
	/**
	 * 将 message 参数转换为 tiptap jsonContent。
	 * - string: 包装为简单的 doc > paragraph > text 结构
	 * - object (TiptapJSONContent): 直接使用（已包含 mention 等节点）
	 */
	const toJsonContent = (message: string | TiptapJSONContent) => {
		if (typeof message === "string") {
			return {
				type: "doc" as const,
				content: [{ type: "paragraph", content: [{ type: "text", text: message }] }],
			}
		}
		return message
	}

	const dispatchScopedMessage = useMemoizedFn(
		async ({
			jsonContent,
			model,
			extra,
			topicMode,
			targetTopic,
		}: {
			jsonContent: TiptapJSONContent
			model?: string
			extra?: Record<string, unknown>
			topicMode?: TopicMode
			targetTopic?: Topic | null
		}) => {
			const runtimeProjectId = getRuntimeProjectId()
			if (!scopedTopicStore || !runtimeProjectId) return false

			const screenshotMentions = collectMentionItemsFromContent(jsonContent as JSONContent)
			const processedJsonContent = (await processMessageMentions(
				jsonContent as JSONContent,
				runtimeProjectId,
				targetTopic?.id ?? activeTopicStore.selectedTopic?.id,
			)) as TiptapJSONContent
			const superAgentExtra = {
				mentions: [],
				chat_mode: "normal",
				...(extra?.super_agent && typeof extra.super_agent === "object"
					? (extra.super_agent as Record<string, unknown>)
					: {}),
				...(typeof extra?.agent_code === "string" ? { agent_code: extra.agent_code } : {}),
				...(model ? { model: { model_id: model } } : {}),
				...(topicMode ? { topic_pattern: topicMode } : {}),
			}

			const success = await messageSendService.dispatchMessage({
				jsonContent: processedJsonContent,
				showLoading: false,
				options: { extra: { super_agent: superAgentExtra } } as any,
				context: resolveMessageSendContext({
					selectedProject:
						selectedProject ?? ({ id: runtimeProjectId } as ProjectListItem),
					selectedTopic: targetTopic ?? activeTopicStore.selectedTopic,
					topicStore: activeTopicStore,
				}),
			})

			if (!success) throw new Error("Failed to send message")
			releaseHtmlScreenshotsAfterSend(screenshotMentions)
			return true
		},
	)

	const getAgentList = useMemoizedFn((): AgentInfo[] => {
		return superMagicModeService._modeList.map((item) => ({
			id: item.mode.identifier,
			name: item.mode.name,
			icon: item.mode.icon_url || item.mode.icon,
			color: item.mode.color,
			type:
				item.agent.type === AgentType.Official
					? "official"
					: item.agent.type === AgentType.Custom
						? "custom"
						: "public",
		}))
	})

	const createTopicAndSend = useMemoizedFn(
		async (params: {
			message: string | TiptapJSONContent
			agentId?: string
			model?: string
		}): Promise<{ topicId: string }> => {
			const runtimeProjectId = getRuntimeProjectId()
			if (!runtimeProjectId) throw new Error("No project selected")

			const requestedAgentId = params.agentId

			// Look up the agent to determine if it's built-in or custom
			let isCustomAgent = false
			if (requestedAgentId) {
				const agentMode = superMagicModeService._modeList.find(
					(item) => item.mode.identifier === requestedAgentId,
				)
				if (agentMode) {
					isCustomAgent = agentMode.agent.type !== AgentType.Official
				}
			}

			const createdTopic = await SuperMagicApi.createTopic({
				project_id: runtimeProjectId,
				topic_name: "",
			})
			if (!createdTopic?.id) throw new Error("Failed to create topic")

			const newTopic = scopedTopicStore
				? await SuperMagicApi.getTopicDetail({ id: createdTopic.id })
				: createdTopic
			if (!newTopic?.id) throw new Error("Failed to load created topic")
			if (scopedTopicStore && (!newTopic.chat_topic_id || !newTopic.chat_conversation_id)) {
				throw new Error("Created topic is missing conversation context")
			}

			// Set topic with agent_code for custom agents
			const topicWithAgent =
				isCustomAgent && requestedAgentId
					? { ...newTopic, agent_code: requestedAgentId }
					: newTopic
			selectCreatedTopic(topicWithAgent)

			// Build pubsub payload
			const jsonContent = toJsonContent(params.message)

			// Delay slightly to allow topic switch to complete
			await new Promise((resolve) => setTimeout(resolve, 300))

			if (params.model) {
				await superMagicTopicModelService.saveModel(newTopic.id, runtimeProjectId, {
					model_id: params.model,
				} as any)
			}

			// Build extra: agent_code for custom agents, model override via super_agent.model
			const extra: Record<string, unknown> = {}
			if (isCustomAgent && requestedAgentId) {
				extra.agent_code = requestedAgentId
			}
			if (params.model) {
				extra.super_agent = { model: { model_id: params.model } }
			}

			const sentDirectly = await dispatchScopedMessage({
				jsonContent,
				model: params.model,
				extra,
				targetTopic: topicWithAgent,
				topicMode: requestedAgentId
					? isCustomAgent
						? TopicMode.CustomAgent
						: (requestedAgentId as TopicMode)
					: TopicMode.MicroApp,
			})
			if (!sentDirectly) {
				pubsub.publish(PubSubEvents.Send_Message_by_Content, {
					jsonContent,
					...(requestedAgentId
						? {
								topicMode: isCustomAgent
									? TopicMode.CustomAgent
									: (requestedAgentId as TopicMode),
							}
						: {}),
					...(Object.keys(extra).length > 0 ? { extra } : {}),
					...(scopedTopicStore ? { targetTopic: topicWithAgent } : {}),
				})
			}

			return { topicId: newTopic.id }
		},
	)

	const sendMessage = useMemoizedFn(
		async (params: { message: string | TiptapJSONContent; model?: string }): Promise<void> => {
			const targetTopic = activeTopicStore.selectedTopic
			if (params.model) {
				const runtimeProjectId = getRuntimeProjectId()
				if (targetTopic?.id && runtimeProjectId) {
					await superMagicTopicModelService.saveModel(targetTopic.id, runtimeProjectId, {
						model_id: params.model,
					} as any)
				}
			}

			const jsonContent = toJsonContent(params.message)
			const sentDirectly = await dispatchScopedMessage({
				jsonContent,
				model: params.model,
				targetTopic,
				topicMode: TopicMode.MicroApp,
			})
			if (!sentDirectly) {
				pubsub.publish(PubSubEvents.Send_Message_by_Content, {
					jsonContent,
					...(params.model
						? { extra: { super_agent: { model: { model_id: params.model } } } }
						: {}),
					targetTopic,
				})
			}
		},
	)

	return { getAgentList, createTopicAndSend, sendMessage }
}
