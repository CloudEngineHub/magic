import type { JSONContent } from "@tiptap/react"
import { ChatApi, SuperMagicApi } from "@/apis"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { getFolderMentionData } from "@/components/business/MentionPanel/utils/directoryMention"
import { userStore } from "@/models/user"
import { EventType } from "@/types/chat"
import { ConversationMessageType } from "@/types/chat/conversation_message"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPost } from "../types"
import { navigateToBatchTopic, SELF_MEDIA_TOPIC_PATTERN } from "./selfMediaBatchSend"

export type SelfMediaPrePublishAnalysisGoal = "ip-growth" | "conversion" | "viral-traffic"

export const SELF_MEDIA_PRE_PUBLISH_ANALYSIS_GOALS: Array<{
	value: SelfMediaPrePublishAnalysisGoal
	labelKey: string
	descriptionKey: string
}> = [
	{
		value: "ip-growth",
		labelKey: "detail.selfMedia.analysis.goals.ipGrowth",
		descriptionKey: "detail.selfMedia.analysis.goalDescriptions.ipGrowth",
	},
	{
		value: "conversion",
		labelKey: "detail.selfMedia.analysis.goals.conversion",
		descriptionKey: "detail.selfMedia.analysis.goalDescriptions.conversion",
	},
	{
		value: "viral-traffic",
		labelKey: "detail.selfMedia.analysis.goals.viralTraffic",
		descriptionKey: "detail.selfMedia.analysis.goalDescriptions.viralTraffic",
	},
]

const ANALYSIS_GOAL_LABELS: Record<SelfMediaPrePublishAnalysisGoal, string> = {
	"ip-growth": "IP增长",
	conversion: "产品转化",
	"viral-traffic": "爆文流量",
}

function generateUniqueId(): string {
	const timestamp = Date.now().toString(36)
	const randomPart = Math.random().toString(36).substring(2, 15)
	return `${timestamp}-${randomPart}`
}

function para(text: string): JSONContent {
	return {
		type: "paragraph",
		content: text ? [{ type: "text", text }] : [],
	}
}

function platformLabel(platform: SelfMediaPlatform): string {
	if (platform === "wechat-official-accounts") return "微信公众号"
	if (platform === "rednote") return "小红书"
	if (platform === "instagram") return "Instagram"
	return platform
}

function titleOf(post: SelfMediaPost): string {
	return post.meta.feedTitle || post.meta.title || post.meta.id || "自媒体文章"
}

export function buildSelfMediaPrePublishAnalysisContent({
	platform,
	analysisGoal,
	post,
}: {
	platform: SelfMediaPlatform
	analysisGoal: SelfMediaPrePublishAnalysisGoal
	post: SelfMediaPost
}): JSONContent {
	const goalLabel = ANALYSIS_GOAL_LABELS[analysisGoal]
	const meta = post.meta || { id: "" }
	const scoringModel =
		platform === "wechat-official-accounts"
			? "微信公众号基础维度：标题/摘要/封面打开率20，长文结构与完读体验25，信息增量/可信度/案例支撑20，移动端排版与阅读负担20，转化动作/关注理由/品牌关系15。"
			: "小红书图文基础维度：封面首屏吸引力25，标题与搜索关键词20，选题痛点与对标差异20，卡片叙事/节奏/收藏价值20，互动设计与发布准备15。"

	return {
		type: "doc",
		content: [
			para(
				"请使用 self-media-pre-publish-analyzer skill，对我 @ 的当前自媒体文章做发布前诊断。",
			),
			para(
				`平台：${platformLabel(platform)}\n分析目标：${goalLabel}\n文章标题：${titleOf(post)}\n作者/IP：${meta.author || "未提供"}\n标签：${meta.tags || "未提供"}`,
			),
			para(scoringModel),
			para(
				"目标权重解释：IP增长优先人设一致、信任、系列化和关注理由；产品转化优先痛点匹配、卖点证据、异议处理和CTA；爆文流量优先首屏点击、标题钩子、热点/搜索匹配和互动诱因。",
			),
			para(
				"请按平台评分卡和目标场景执行诊断：先读取对应平台的详细评分参考，再输出每个基础维度下的二级分项评分、证据、扣分原因和优先级。",
			),
			para(
				"评分前请先列出证据清单：已读取的 post.json、卡片/文章 HTML、封面/素材、元信息、联网对标样本，以及缺失或不可读材料。",
			),
			para(
				"请开启联网搜索，拉取同类平台内容做对比。外部资料只作为运营经验参考，不要把第三方资料当成平台硬性规则。",
			),
			para(
				"输出格式固定为：总分、分项分、最大问题、同类内容对比、优先修改清单、可直接交给创作助手的改稿指令。",
			),
		],
	}
}

function buildFolderMention(item: AttachmentItem) {
	return {
		type: MentionItemType.FOLDER,
		data: getFolderMentionData({
			directoryId: item.file_id,
			directoryName: item.file_name || item.filename || item.display_filename,
			directoryPath: item.relative_file_path,
			directoryMetadata: item.display_config,
		}),
	}
}

export interface SendSelfMediaPrePublishAnalysisParams {
	selectedProject: { id: string } | null | undefined
	platform: SelfMediaPlatform
	analysisGoal: SelfMediaPrePublishAnalysisGoal
	post: SelfMediaPost
	postDirectoryItem: AttachmentItem
}

export async function sendSelfMediaPrePublishAnalysis({
	selectedProject,
	platform,
	analysisGoal,
	post,
	postDirectoryItem,
}: SendSelfMediaPrePublishAnalysisParams) {
	if (!selectedProject?.id) throw new Error("No project selected")

	const projectId = selectedProject.id
	const topicName = `[发布前诊断] ${titleOf(post)}`
	const newTopic = await SuperMagicApi.createTopic({
		project_id: projectId,
		topic_name: topicName,
	})

	if (!newTopic?.id) throw new Error("Failed to create analysis topic")
	SuperMagicApi.preWarmSandbox?.({ topic_id: newTopic.id })

	const chatTopicId = (newTopic as any).chat_topic_id ?? newTopic.id
	const conversationId = (newTopic as any).chat_conversation_id
	if (!conversationId) throw new Error("No conversation_id for analysis topic")

	const content = JSON.stringify(
		buildSelfMediaPrePublishAnalysisContent({
			platform,
			analysisGoal,
			post,
		}),
	)
	const messageId = generateUniqueId()
	const timestamp = Date.now()
	const userId = userStore.user.userInfo?.user_id

	await ChatApi.chat(EventType.Chat, {
		message: {
			type: ConversationMessageType.RichText,
			[ConversationMessageType.RichText]: {
				content,
				instructs: [{ value: "normal" }],
				extra: {
					super_agent: {
						mentions: [buildFolderMention(postDirectoryItem)],
						topic_pattern: SELF_MEDIA_TOPIC_PATTERN,
						chat_mode: "normal",
						enable_web_search: true,
						dynamic_params: {
							message_version: "v2",
						},
					},
				},
			},
			send_timestamp: timestamp,
			send_time: timestamp,
			sender_id: userId,
			app_message_id: messageId,
			message_id: messageId,
			topic_id: chatTopicId,
		},
		conversation_id: conversationId,
	} as any)

	navigateToBatchTopic(projectId, newTopic as { id: string } & Record<string, unknown>)
	return newTopic
}
