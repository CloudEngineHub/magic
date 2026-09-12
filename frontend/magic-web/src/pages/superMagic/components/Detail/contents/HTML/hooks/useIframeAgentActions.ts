/**
 * useIframeAgentActions
 *
 * 封装 iframe agent 相关的业务逻辑：获取 agent 列表、创建话题并发送消息、在当前话题发送消息。
 * 返回值可直接传入 useIframeAgent。
 */

import { useMemoizedFn } from "ahooks"
import {
	AgentType,
	type ProjectListItem,
	type Topic,
} from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { SuperMagicApi } from "@/apis"
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
import {
	isSingleTopicHostProject,
	resolveIframeHostTopicMode,
} from "@/pages/superMagic/utils/isSingleTopicHostProject"

/**
 * @param projectId 原项目（origin）：文件/库所在项目，用于 mention 解析
 * @param topicStore 调用方传入的会话 store；未传则会话类 API 不可用
 * @param selectedProject 宿主项目（host）：用户当前所在项目，用于建话题和发送
 */
export function useIframeAgentActions(
	projectId?: string,
	topicStore?: TopicStore,
	selectedProject?: ProjectListItem | null,
) {
	// origin：发布预览嵌在别的项目时，仍指向微应用原项目
	const originProjectId = projectId
	// host：消息必须发到用户当前所在项目，不能回落到 origin
	const hostProjectId = selectedProject?.id
	const selectCreatedTopic = useMemoizedFn((topic: Topic) => {
		if (!topicStore) return
		// 同步传入的 store，避免后续发送仍读到旧话题
		topicStore.setTopics([topic, ...topicStore.topics.filter((item) => item.id !== topic.id)])
		topicStore.setSelectedTopic(topic)
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
			if (!topicStore || !hostProjectId) return false

			const screenshotMentions = collectMentionItemsFromContent(jsonContent as JSONContent)
			// mention / 截图解析走 origin：文件仍在原微应用项目
			const processedJsonContent = (await processMessageMentions(
				jsonContent as JSONContent,
				originProjectId ?? hostProjectId,
				targetTopic?.id ?? topicStore.selectedTopic?.id,
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

			// 用传入的 store 直发，不走全局输入框 pubsub，避免发到错误会话
			const success = await messageSendService.dispatchMessage({
				jsonContent: processedJsonContent,
				showLoading: false,
				options: { extra: { super_agent: superAgentExtra } } as any,
				context: resolveMessageSendContext({
					selectedProject: selectedProject ?? ({ id: hostProjectId } as ProjectListItem),
					selectedTopic: targetTopic ?? topicStore.selectedTopic,
					topicStore,
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

	const sendMessage = useMemoizedFn(
		async (params: { message: string | TiptapJSONContent; model?: string }): Promise<void> => {
			if (!hostProjectId) throw new Error("No project selected")
			if (!topicStore) throw new Error("No topic store")

			const targetTopic = topicStore.selectedTopic
			if (params.model && targetTopic?.id) {
				await superMagicTopicModelService.saveModel(targetTopic.id, hostProjectId, {
					model_id: params.model,
				} as any)
			}

			const jsonContent = toJsonContent(params.message)
			const sent = await dispatchScopedMessage({
				jsonContent,
				model: params.model,
				targetTopic,
				topicMode: resolveIframeHostTopicMode(selectedProject),
			})
			if (!sent) throw new Error("Failed to send message")
		},
	)

	const createTopicAndSend = useMemoizedFn(
		async (params: {
			message: string | TiptapJSONContent
			agentId?: string
			model?: string
		}): Promise<{ topicId: string }> => {
			if (!hostProjectId) throw new Error("No project selected")
			if (!topicStore) throw new Error("No topic store")

			// Single-topic hosts reuse the current topic instead of creating.
			if (isSingleTopicHostProject(selectedProject)) {
				const currentTopic = topicStore.selectedTopic
				if (!currentTopic?.id) throw new Error("No topic selected")
				await sendMessage({ message: params.message, model: params.model })
				return { topicId: currentTopic.id }
			}

			const requestedAgentId = params.agentId

			// 官方 agent 走内置 topicMode，自定义 agent 需要带 agent_code
			let isCustomAgent = false
			if (requestedAgentId) {
				const agentMode = superMagicModeService._modeList.find(
					(item) => item.mode.identifier === requestedAgentId,
				)
				if (agentMode) {
					isCustomAgent = agentMode.agent.type !== AgentType.Official
				}
			}

			// 话题建在 host：发布预览时用户当前项目，而不是微应用原项目
			const createdTopic = await SuperMagicApi.createTopic({
				project_id: hostProjectId,
				topic_name: "",
			})
			if (!createdTopic?.id) throw new Error("Failed to create topic")

			// 直发需要完整会话上下文，创建接口可能不含 chat_topic_id
			const newTopic = await SuperMagicApi.getTopicDetail({ id: createdTopic.id })
			if (!newTopic?.id) throw new Error("Failed to load created topic")
			if (!newTopic.chat_topic_id || !newTopic.chat_conversation_id) {
				throw new Error("Created topic is missing conversation context")
			}

			const topicWithAgent =
				isCustomAgent && requestedAgentId
					? { ...newTopic, agent_code: requestedAgentId }
					: newTopic
			selectCreatedTopic(topicWithAgent)

			const jsonContent = toJsonContent(params.message)

			// 等 store 选中项生效后再发，避免并发时绑到旧话题
			await new Promise((resolve) => setTimeout(resolve, 300))

			if (params.model) {
				await superMagicTopicModelService.saveModel(newTopic.id, hostProjectId, {
					model_id: params.model,
				} as any)
			}

			// extra：自定义 agent 带 agent_code，指定模型走 super_agent.model
			const extra: Record<string, unknown> = {}
			if (isCustomAgent && requestedAgentId) {
				extra.agent_code = requestedAgentId
			}
			if (params.model) {
				extra.super_agent = { model: { model_id: params.model } }
			}

			const sent = await dispatchScopedMessage({
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
			if (!sent) throw new Error("Failed to send message")

			return { topicId: newTopic.id }
		},
	)

	return { getAgentList, createTopicAndSend, sendMessage }
}
