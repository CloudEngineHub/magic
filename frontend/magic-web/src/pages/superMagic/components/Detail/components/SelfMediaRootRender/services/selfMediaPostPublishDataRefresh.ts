import type { JSONContent } from "@tiptap/react"
import i18n from "i18next"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { getFolderMentionData } from "@/components/business/MentionPanel/utils/directoryMention"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { SelfMediaPlatform } from "../../../types"
import { ALL_PLATFORMS } from "../components/SelfMediaInitPanel/types"
import type { SelfMediaPost } from "../types"

const I18N_NS = "super"
export const SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN = "ip-manager" as const

function para(text: string): JSONContent {
	return {
		type: "paragraph",
		content: text ? [{ type: "text", text }] : [],
	}
}

function paraNodes(content: JSONContent[]): JSONContent {
	return {
		type: "paragraph",
		content,
	}
}

function folderMentionNode(item: AttachmentItem): JSONContent {
	const mention = buildFolderMention(item)
	return {
		type: "mention",
		attrs: {
			id: null,
			label: null,
			mentionSuggestionChar: "@",
			type: mention.type,
			data: mention.data,
		},
	}
}

function paraWithMentionTemplate(template: string, mention: JSONContent): JSONContent {
	const placeholder = "{{mention}}"
	const index = template.indexOf(placeholder)
	if (index === -1) {
		return paraNodes([{ type: "text", text: `${template} ` }, mention])
	}

	const before = template.slice(0, index)
	const after = template.slice(index + placeholder.length)
	const content: JSONContent[] = []
	if (before) content.push({ type: "text", text: before })
	content.push(mention)
	if (after) content.push({ type: "text", text: after })
	return paraNodes(content)
}

function t(key: string, defaultValue: string, values?: Record<string, unknown>): string {
	return String(
		i18n.t(key, {
			ns: I18N_NS,
			defaultValue,
			...values,
		}),
	)
}

function platformLabel(platform: SelfMediaPlatform): string {
	const platformOption = ALL_PLATFORMS.find((item) => item.value === platform)
	if (!platformOption) return platform
	return t(platformOption.labelKey, platform)
}

export function titleOf(post: SelfMediaPost): string {
	return (
		post.meta.feedTitle ||
		post.meta.title ||
		post.meta.id ||
		t("detail.selfMedia.opsRefresh.prompt.untitled", "Self-media post")
	)
}

export function buildFolderMention(item: AttachmentItem) {
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

export function buildFolderMentionItem(item: AttachmentItem): MentionListItem {
	const mention = buildFolderMention(item)
	return {
		type: "mention",
		attrs: {
			type: mention.type,
			data: mention.data,
		},
	}
}

export function buildSelfMediaPostPublishDataRefreshContent({
	platform,
	publishedUrl,
	post,
	postDirectoryItem,
}: {
	platform: SelfMediaPlatform
	publishedUrl: string
	post: SelfMediaPost
	postDirectoryItem: AttachmentItem
}): JSONContent {
	const title = titleOf(post)
	return {
		type: "doc",
		content: [
			paraWithMentionTemplate(
				t(
					"detail.selfMedia.opsRefresh.prompt.opening",
					"Act as an IP operations specialist and fetch then write back post-publication real operations data for {{mention}}.",
				),
				folderMentionNode(postDirectoryItem),
			),
			para(
				t(
					"detail.selfMedia.opsRefresh.prompt.metadata",
					"Platform: {{platform}}\nTitle: {{title}}\nPublished URL: {{publishedUrl}}",
					{
						platform: platformLabel(platform),
						title,
						publishedUrl,
					},
				),
			),
			para(
				t(
					"detail.selfMedia.opsRefresh.prompt.instruction",
					'Read ops/source.json, ops/metrics.json, and ops/comments.json in the current post folder first, and use the published URL in this message as the fallback target. Visit the real article URL and collect or organize real exposure, reads, likes, saves, comments, shares, follows, and conversion metrics. Update the latest structured metrics in ops/metrics.json and append or upsert this sync as a history snapshot in metrics.json.history. Update comments/audience feedback in ops/comments.json and append or upsert this sync in comments.json.history. Update ops/source.json fetchStatus, lastFetchedAt, any failure reason, and append or upsert the source sync status in source.json.history. Write the human-readable operations review, attribution, trend interpretation, and next actions to ops/review.html. In ops/review.html, render next actions as clickable buttons; bind them with addEventListener, prefer window.Magic.project.sendMessage(message, { model: "auto" }) when available, and fall back to window.Magic.setInputMessage(message).',
				),
			),
		],
	}
}

export interface SendSelfMediaPostPublishDataRefreshParams {
	selectedProject: { id: string } | null | undefined
	platform: SelfMediaPlatform
	selectedModel?: ModelItem | null
	publishedUrl: string
	post: SelfMediaPost
	postDirectoryItem: AttachmentItem
}

export async function sendSelfMediaPostPublishDataRefresh({
	selectedProject,
	platform,
	selectedModel,
	publishedUrl,
	post,
	postDirectoryItem,
}: SendSelfMediaPostPublishDataRefreshParams) {
	if (!selectedProject?.id) throw new Error("No project selected")

	const topicName = t(
		"detail.selfMedia.opsRefresh.prompt.topicName",
		"[Real data refresh] {{title}}",
		{
			title: titleOf(post),
		},
	)
	const topicMode = SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN as unknown as TopicMode
	const folderMention = buildFolderMention(postDirectoryItem)
	const content = buildSelfMediaPostPublishDataRefreshContent({
		platform,
		publishedUrl,
		post,
		postDirectoryItem,
	})

	pubsub.publish(PubSubEvents.Create_New_Topic, {
		topicMode,
		topicName,
		afterCreate: {
			content,
			send: true,
			topicMode,
			selectedModel: selectedModel ?? null,
			mentionItems: [buildFolderMentionItem(postDirectoryItem)],
			extra: {
				super_agent: {
					mentions: [folderMention],
					topic_pattern: SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN,
					chat_mode: "normal",
					enable_web_search: true,
					dynamic_params: {
						message_version: "v2",
					},
				},
			},
		},
	})
}
