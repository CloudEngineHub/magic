import { z } from "zod"
import { getAttachmentPath, listLibraryFiles } from "./researchFiles"
import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { ParsedResearchFile } from "../types"

export const STUDY_TOPICS_DIR = "study-topics/"
const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)
const markerSchema = z
	.object({
		schema_version: z.literal(1),
		topic_id: idSchema,
		primary_topic_id: idSchema,
		study_dir: z.string().regex(/^studies\/[A-Za-z0-9_-]+$/),
		state: z.enum(["linked", "deleting"]),
		title: z.string(),
	})
	.refine((marker) =>
		marker.state === "deleting"
			? marker.topic_id === marker.primary_topic_id
			: marker.topic_id !== marker.primary_topic_id,
	)

export type StudyTopicMarker = z.infer<typeof markerSchema>
export function parseStudyTopicMarker(raw: unknown): ParsedResearchFile<StudyTopicMarker> {
	const parsed = markerSchema.safeParse(raw)
	return parsed.success
		? { ok: true, data: parsed.data }
		: { ok: false, reason: "invalid_study_topic_marker" }
}
export function studyTopicMarkerPath(topicId: string): string {
	if (!idSchema.safeParse(topicId).success) throw new Error("invalid_study_topic_id")
	return `${STUDY_TOPICS_DIR}${topicId}.json`
}
export function listStudyTopicMarkers(list: AttachmentItem[]): AttachmentItem[] {
	return listLibraryFiles(list, STUDY_TOPICS_DIR)
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
