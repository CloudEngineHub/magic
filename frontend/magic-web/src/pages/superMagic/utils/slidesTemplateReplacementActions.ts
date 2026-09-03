import type { JSONContent } from "@/infrastructure/editors/tiptap/react"
import type { SendMessageByContentPayload } from "@/pages/superMagic/components/MessageEditor/types"
import type { SuperMagicCreateNewTopicPayload } from "@/pages/superMagic/events/message"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	MentionItemType,
	type ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import type {
	MentionListItem,
	TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import { getFolderMentionData } from "@/components/business/MentionPanel/utils/directoryMention"
import { localeTextToDisplayString } from "@/pages/superMagic/components/MainInputContainer/panels/utils"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

export type SlidesTemplateReplacementTarget =
	{ scope: "deck" } | { scope: "slide"; slideIndex: number }

interface SlidesTemplateReplacementPayloadOptions {
	template: OptionItem
	target: SlidesTemplateReplacementTarget
	mainFile: AttachmentItem
	parentFolder?: AttachmentItem
	targetSlide?: AttachmentItem
}

function getDisplayName(item: AttachmentItem): string {
	return item.file_name || item.filename || item.display_filename || item.name || ""
}

function getExtension(item: AttachmentItem): string {
	const explicit = (item.file_extension || "").replace(/^\./, "").toLowerCase()
	if (explicit) return explicit
	const name = getDisplayName(item)
	const separator = name.lastIndexOf(".")
	return separator > 0 ? name.slice(separator + 1).toLowerCase() : ""
}

function toMentionAttributes(item: AttachmentItem): TiptapMentionAttributes {
	if (item.is_directory) {
		return {
			type: MentionItemType.FOLDER,
			data: getFolderMentionData({
				directoryId: item.file_id,
				directoryName: getDisplayName(item),
				directoryPath: item.relative_file_path,
				directoryMetadata: item.display_config,
			}),
		}
	}

	return {
		type: MentionItemType.PROJECT_FILE,
		data: {
			file_id: item.file_id,
			file_name: getDisplayName(item),
			file_path: item.relative_file_path,
			file_extension: getExtension(item),
		} as ProjectFileMentionData,
	}
}

function mentionNode(attrs: TiptapMentionAttributes): JSONContent {
	return { type: "mention", attrs }
}

function textNode(text: string): JSONContent {
	return { type: "text", text }
}

function appendMentionLine(
	content: JSONContent[],
	label: string,
	item: AttachmentItem | undefined,
): MentionListItem | undefined {
	if (!item?.file_id) return undefined
	const attrs = toMentionAttributes(item)
	const mention: MentionListItem = {
		type: "mention",
		attrs,
	}
	content.push(textNode(label), mentionNode(attrs), textNode("\n"))
	return mention
}

/**
 * Builds the fixed natural-language command sent after a template is confirmed.
 * The selected template code and file mentions remain structured data so the agent
 * can resolve the exact source nodes instead of parsing display names or paths.
 */
export function buildSlidesTemplateReplacementPayload({
	template,
	target,
	mainFile,
	parentFolder,
	targetSlide,
}: SlidesTemplateReplacementPayloadOptions): SuperMagicCreateNewTopicPayload {
	const templateCode = localeTextToDisplayString(template.value)
	const templateName = localeTextToDisplayString(template.label) || templateCode
	const content: JSONContent[] = [
		textNode("请更换现有 HTML PPT 的模板。\n"),
		textNode(`模板名称：${templateName}\n`),
		textNode(`template_code：${templateCode}\n`),
	]
	const mentionItems: SendMessageByContentPayload["mentionItems"] = []

	if (target.scope === "slide") {
		const slideMention = appendMentionLine(content, "目标页：", targetSlide)
		if (slideMention) mentionItems.push(slideMention)
		content.push(
			textNode(
				`作用范围：第 ${target.slideIndex + 1} 页。直接修改当前 PPT 的对应页，其他页面保持不变。\n`,
			),
		)
	} else {
		const mainMention = appendMentionLine(content, "当前 PPT：", mainFile)
		if (mainMention) mentionItems.push(mainMention)
		const folderMention = appendMentionLine(content, "所属文件夹：", parentFolder)
		if (folderMention) mentionItems.push(folderMention)
		content.push(textNode("作用范围：整本 PPT。\n"))
	}

	content.push(
		textNode(
			"默认只更换样式、布局、主题和视觉资源，不修改原始文本与图片内容；用户后续补充说明优先。",
		),
	)

	return {
		topicMode: TopicMode.PPT,
		afterCreate: {
			send: true,
			topicMode: TopicMode.PPT,
			content: { type: "doc", content },
			mentionItems,
		},
	}
}
