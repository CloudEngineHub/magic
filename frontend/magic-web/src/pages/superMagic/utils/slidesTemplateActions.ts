import i18next from "i18next"
import type { SuperMagicCreateNewTopicPayload } from "@/pages/superMagic/events/message"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { getFolderMentionData } from "@/components/business/MentionPanel/utils/directoryMention"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

/** Builds the existing create-topic contract with one folder mention followed by the prompt. */
export function buildConvertToSlidesTemplatePayload(
	folder: AttachmentItem,
): SuperMagicCreateNewTopicPayload {
	const mention = {
		type: MentionItemType.FOLDER,
		data: getFolderMentionData({
			directoryId: folder.file_id,
			directoryName:
				folder.file_name || folder.filename || folder.display_filename || folder.name,
			directoryPath: folder.relative_file_path,
			directoryMetadata: folder.display_config,
		}),
	} as const

	return {
		topicMode: TopicMode.PPT,
		afterCreate: {
			send: true,
			topicMode: TopicMode.PPT,
			content: {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "mention", attrs: mention },
							{
								type: "text",
								text: ` ${i18next.t("mySlidesTemplates.convertPrompt", { ns: "super" })}`,
							},
						],
					},
				],
			},
			mentionItems: [{ type: "mention", attrs: mention }],
		},
	}
}
