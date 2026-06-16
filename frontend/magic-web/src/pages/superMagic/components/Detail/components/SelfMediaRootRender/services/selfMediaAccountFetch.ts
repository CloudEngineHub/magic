import { SuperMagicApi } from "@/apis"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import routeManageService from "@/pages/superMagic/services/routeManageService"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { buildPlainTextJSONContent } from "../../../../MessageEditor/utils"

export interface FetchAccountInfoParams {
	platform: string
	platformLabel: string
	projectId: string
	folderPath?: string
	accountName: string
}

const SEND_MESSAGE_DELAY_MS = 300

function buildAccountFetchMessagePayload(
	platformLabel: string,
	accountName: string,
	folderPath?: string,
) {
	const draftPath = folderPath ? `${folderPath}/__drafts/draft.json` : `__drafts/draft.json`
	const prompt = `请帮我获取${platformLabel}账号「${accountName}」的信息，包括品牌/IP定位和目标受众。获取完成后请将信息填写到 ${draftPath} 中的 global 字段（author、brandPosition、targetAudience），author 保持为「${accountName}」。`
	return {
		jsonContent: buildPlainTextJSONContent(prompt),
		extra: {
			super_agent: {
				topic_pattern: "ip-manager",
			},
		},
	}
}

function publishAccountFetchMessage(
	platformLabel: string,
	accountName: string,
	folderPath?: string,
	delayMs = 0,
) {
	const payload = buildAccountFetchMessagePayload(platformLabel, accountName, folderPath)
	if (delayMs <= 0) {
		pubsub.publish(PubSubEvents.Send_Message_by_Content, payload)
		return
	}
	setTimeout(() => {
		pubsub.publish(PubSubEvents.Send_Message_by_Content, payload)
	}, delayMs)
}

/**
 * Send ip-manager message to fetch account info into draft.json.
 * Prefer current topic so the init panel stays visible; fallback creates a dedicated topic.
 */
export async function fetchAccountInfoViaTopic({
	platformLabel,
	projectId,
	folderPath,
	accountName,
}: FetchAccountInfoParams): Promise<{ topicId: string } | null> {
	if (!projectId) {
		console.error("No project selected for account fetch")
		return null
	}

	const trimmedAccountName = accountName.trim()
	if (!trimmedAccountName) {
		console.error("Account name is required for platform fetch")
		return null
	}

	const selectedProject = projectStore.selectedProject
	const currentTopic = topicStore.selectedTopic
	const canUseCurrentTopic =
		Boolean(currentTopic?.id) && (!selectedProject?.id || selectedProject.id === projectId)

	if (canUseCurrentTopic && currentTopic?.id) {
		publishAccountFetchMessage(platformLabel, trimmedAccountName, folderPath)
		return { topicId: currentTopic.id }
	}

	const topicName = `获取${platformLabel}账号信息`
	const newTopic = await SuperMagicApi.createTopic({
		project_id: projectId,
		topic_name: topicName,
	})

	if (!newTopic?.id) {
		console.error("Failed to create topic for account info fetch")
		return null
	}

	SuperMagicApi.preWarmSandbox({ topic_id: newTopic.id })

	topicStore.setSelectedTopic(newTopic)
	routeManageService.navigateToState({
		projectId: selectedProject?.id || projectId,
		topicId: newTopic.id,
	})

	publishAccountFetchMessage(platformLabel, trimmedAccountName, folderPath, SEND_MESSAGE_DELAY_MS)

	return { topicId: newTopic.id }
}
