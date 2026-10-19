import { SuperMagicApi } from "@/apis"
import { getFileContentsByIds } from "@/pages/superMagic/utils/api"
import { getAttachmentPath, parseStudyFile } from "./researchFiles"
import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

/** Read only contract IDs; unknown/malformed JSON must not claim another study's topic. */
export function studyTopicIds(raw: unknown): string[] {
	const parsed = parseStudyFile(raw)
	if (!parsed.ok) return []
	return [
		...new Set(
			[parsed.data.topic_id, ...(parsed.data.topic_ids ?? [])].filter((id): id is string =>
				Boolean(id && id !== "0"),
			),
		),
	]
}

/** Read the latest whole contract and preserve extra fields when adding one relationship. */
export async function linkStudyTopic(fileId: string, primaryId: string, topicId: string) {
	const { successes } = await getFileContentsByIds([fileId], {
		responseType: "text",
		forceRefresh: true,
	})
	const content = successes.get(fileId)
	if (typeof content !== "string") throw new Error("study_topic_read_failed")
	const raw: unknown = JSON.parse(content)
	const parsed = parseStudyFile(raw)
	if (!parsed.ok || !raw || typeof raw !== "object" || parsed.data.topic_id !== primaryId)
		throw new Error("study_topic_contract_changed")
	const next = {
		...raw,
		topic_ids: [...new Set([...(parsed.data.topic_ids ?? []), topicId])],
	}
	const response = await SuperMagicApi.saveFileContent([
		{ file_id: fileId, content: JSON.stringify(next, null, 2) + "\n" },
	])
	if (!response?.success_files?.some((file) => String(file.file_id) === fileId))
		throw new Error("study_topic_save_unconfirmed")
	return next
}

/** Native file identity survives transport, history and re-editing; no prompt prose in the UI. */
export function studyTopicReference(
	file: AttachmentItem,
	projectId: string,
	title: string,
): MentionListItem {
	return {
		type: "mention",
		attrs: {
			type: MentionItemType.PROJECT_FILE,
			data: {
				file_id: String(file.file_id),
				file_name: title,
				file_path: getAttachmentPath(file),
				file_extension: "json",
				project_id: projectId,
			},
		},
	}
}

export function appendStudyReference(
	value: JSONContent | undefined,
	mention: MentionListItem,
): JSONContent {
	// Retry/re-edit payloads already contain the native reference; do not add a second chip.
	const contains = (node: JSONContent): boolean =>
		(node.type === "mention" &&
			node.attrs?.type === MentionItemType.PROJECT_FILE &&
			node.attrs.data?.file_id === mention.attrs.data.file_id) ||
		Boolean(node.content?.some(contains))
	if (value && contains(value)) return value
	return {
		type: "doc",
		...value,
		content: [...(value?.content ?? []), { type: "paragraph", content: [mention] }],
	}
}
