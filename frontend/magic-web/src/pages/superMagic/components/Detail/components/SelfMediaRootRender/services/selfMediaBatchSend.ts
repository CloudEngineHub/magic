import { ChatApi, SuperMagicApi } from "@/apis"
import { EventType } from "@/types/chat"
import { ConversationMessageType } from "@/types/chat/conversation_message"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { userStore } from "@/models/user"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import routeManageService from "@/pages/superMagic/services/routeManageService"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
	MaterialItem,
} from "../components/SelfMediaInitPanel/types"
import { collectArticleMaterials } from "../components/SelfMediaInitPanel/types"
import {
	buildArticlePromptContent,
	buildMentionsFromMaterialFiles,
	resolveArticleFolderName,
} from "./selfMediaPromptBuilder"
import { superMagicUploadTokenService } from "../../../../MessageEditor/services/UploadTokenService"
import { Upload } from "@dtyq/upload-sdk"

/** Agent pattern for self-media content generation */
export const SELF_MEDIA_TOPIC_PATTERN = "ip-manager" as const

function generateUniqueId(): string {
	const timestamp = Date.now().toString(36)
	const randomPart = Math.random().toString(36).substring(2, 15)
	return `${timestamp}-${randomPart}`
}

export interface ArticleBatchTopicItem {
	topicId: string
	topicName: string
	articleTitle: string
	articleIndex: number
	topic: { id: string } & Record<string, unknown>
}

/**
 * Switch workspace to the given topic (message panel + route).
 */
export function navigateToBatchTopic(
	projectId: string,
	topic: { id: string } & Record<string, unknown>,
): void {
	pubsub.publish(PubSubEvents.Expand_Topic_Conversation_Panel)
	topicStore.setSelectedTopic(topic as never)
	routeManageService.navigateToState({
		projectId: projectStore.selectedProject?.id || projectId,
		topicId: topic.id,
	})
}

/**
 * Upload material files to the project workspace under a specific folder.
 * Updates each MaterialItem's uploadedPath with the remote path.
 */
async function uploadMaterials(
	materials: MaterialItem[],
	projectId: string,
	folderPath: string,
): Promise<void> {
	if (materials.length === 0) return

	const credentials = await superMagicUploadTokenService.getUploadToken(projectId)
	if (!credentials) {
		console.error("Failed to get upload token for materials")
		return
	}

	const materialDir = `${folderPath}/materials`

	for (const item of materials) {
		// Skip items already at the target location (e.g., picked from project files)
		// but re-upload items from __drafts/ paths since those may have been archived/moved
		if (item.uploadedPath && !item.uploadedPath.includes("__drafts/")) continue
		if (!item.file?.size) continue
		// Clear stale draft path so it gets updated with the new location
		item.uploadedPath = undefined as any
		try {
			const uploader = new Upload()

			const result = await new Promise<string>((resolve, reject) => {
				const { success, fail } = uploader.upload({
					file: item.file,
					fileName: item.file.name,
					customCredentials: superMagicUploadTokenService.changeDir(
						credentials,
						materialDir,
					),
					body: JSON.stringify({
						storage: "private",
						sts: true,
						content_type: item.file.type || "application/octet-stream",
					}),
				})

				success?.((res: any) => resolve(res?.data?.path || res?.key || res?.file_key || ""))
				fail?.((err: any) => reject(err))
			})

			if (result) {
				item.uploadedPath = `${materialDir}/${item.file.name}`
				await superMagicUploadTokenService.saveFileToProject({
					project_id: projectId,
					file_key: result,
					file_name: item.file.name,
					file_size: item.file.size,
					file_type: "user_upload",
					storage_type: "workspace",
					source: "home" as any,
					relative_file_path: `${materialDir}/${item.file.name}`,
				})
			}
		} catch (err) {
			console.error(`Failed to upload material: ${item.file.name}`, err)
		}
	}
}

export interface SendArticleBatchParams {
	articles: ArticleDetail[]
	globalSettings: SelfMediaInitGlobalSettings
	selectedProject: { id: string } | null | undefined
	selfMediaProjectDirectory?: {
		directoryId?: string
		directoryPath?: string
		directoryName?: string
	}
	/** Model ID to use for AI generation */
	modelId?: string
	/** Image model ID */
	imageModelId?: string
	/** Video model ID */
	videoModelId?: string
	/** Called after each topic is created and its first message is sent */
	onTopicCreated?: (item: ArticleBatchTopicItem) => void
	onProgress?: (phase: ArticleBatchProgressPhase, articleIndex: number) => void
}

export type ArticleBatchProgressPhase = "creating-topic" | "uploading-materials" | "sending-message"

/**
 * For each article, create a new topic and send the prompt via ip-manager.
 */
export async function sendArticleBatch({
	articles,
	globalSettings,
	selectedProject,
	selfMediaProjectDirectory,
	modelId,
	imageModelId,
	videoModelId,
	onTopicCreated,
	onProgress,
}: SendArticleBatchParams): Promise<ArticleBatchTopicItem[]> {
	if (!selectedProject?.id) {
		throw new Error("No project selected")
	}

	const projectId = selectedProject.id
	const created: ArticleBatchTopicItem[] = []
	const projectRootPath = selfMediaProjectDirectory?.directoryPath?.replace(/\/+$/, "") || ""

	for (let i = 0; i < articles.length; i++) {
		const article = articles[i]
		const folderName = resolveArticleFolderName(article, i)
		const postFolderPath = projectRootPath
			? `${projectRootPath}/posts/${folderName}`
			: `posts/${folderName}`
		const materialDir = `${postFolderPath}/materials`
		const topicName = `[自媒体] ${article.title}`

		onProgress?.("creating-topic", i)
		const newTopic = await SuperMagicApi.createTopic({
			project_id: projectId,
			topic_name: topicName,
		})

		if (!newTopic?.id) {
			console.error(`Failed to create topic for article: ${article.title}`)
			continue
		}

		SuperMagicApi.preWarmSandbox({ topic_id: newTopic.id })

		const allMaterials = collectArticleMaterials(article)
		if (allMaterials.length > 0) {
			onProgress?.("uploading-materials", i)
			await uploadMaterials(allMaterials, projectId, postFolderPath)
		}

		const {
			content: promptContent,
			fileMentions,
			targetDirectoryMention,
		} = buildArticlePromptContent(
			globalSettings,
			article,
			materialDir,
			selfMediaProjectDirectory,
		)
		const content = JSON.stringify(promptContent)
		const messageId = generateUniqueId()
		const timestamp = Date.now()
		const userId = userStore.user.userInfo?.user_id

		const chatTopicId = (newTopic as any).chat_topic_id ?? newTopic.id
		const conversationId = (newTopic as any).chat_conversation_id

		if (!conversationId) {
			console.error(`No conversation_id for topic: ${topicName}`)
			continue
		}

		const mentions: any[] = []
		if (targetDirectoryMention) {
			mentions.push({
				type: MentionItemType.FOLDER,
				data: targetDirectoryMention,
			})
		}
		mentions.push(...buildMentionsFromMaterialFiles(fileMentions))

		onProgress?.("sending-message", i)
		await ChatApi.chat(EventType.Chat, {
			message: {
				type: ConversationMessageType.RichText,
				[ConversationMessageType.RichText]: {
					content,
					instructs: [{ value: "normal" }],
					extra: {
						super_agent: {
							mentions,
							topic_pattern: SELF_MEDIA_TOPIC_PATTERN,
							chat_mode: "normal",
							...(modelId ? { model: { model_id: modelId } } : {}),
							...(imageModelId ? { image_model: { model_id: imageModelId } } : {}),
							...(videoModelId ? { video_model: { model_id: videoModelId } } : {}),
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

		const item: ArticleBatchTopicItem = {
			topicId: newTopic.id,
			topicName,
			articleTitle: article.title,
			articleIndex: i,
			topic: newTopic as { id: string } & Record<string, unknown>,
		}
		created.push(item)
		onTopicCreated?.(item)
	}

	return created
}
