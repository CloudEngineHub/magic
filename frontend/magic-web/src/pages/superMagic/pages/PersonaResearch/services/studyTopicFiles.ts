import { SuperMagicApi } from "@/apis"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getFileContentsByIds } from "@/pages/superMagic/utils/api"
import { ensureProjectRootDir } from "./projectFileWriter"
import { getAttachmentPath } from "./researchFiles"
import {
	parseStudyTopicMarker,
	STUDY_TOPICS_DIR,
	studyTopicMarkerPath,
	type StudyTopicMarker,
} from "./studyTopics"

import { ResearchOperationError } from "./researchOperationError"

/** Immutable per-topic files avoid a read/modify/write of the running study's state. */
export async function persistStudyTopicMarker(
	projectId: string,
	attachments: AttachmentItem[],
	marker: StudyTopicMarker,
): Promise<AttachmentItem> {
	const parsed = parseStudyTopicMarker(marker)
	if (!parsed.ok) throw new Error(parsed.reason)
	const path = studyTopicMarkerPath(marker.topic_id)
	const existing = attachments.find((item) => getAttachmentPath(item) === path)
	let file: AttachmentItem | undefined = existing
	try {
		if (!file) {
			const parentId = await ensureProjectRootDir(projectId, STUDY_TOPICS_DIR, attachments)
			if (!parentId) throw new Error("study_topic_directory_missing")
			const created = (await SuperMagicApi.createFile({
				project_id: projectId,
				parent_id: parentId,
				file_name: `${marker.topic_id}.json`,
				is_directory: false,
				// Two deletions may race to publish the same immutable primary-topic intent.
				ignore_duplicate: marker.state === "deleting",
			})) as AttachmentItem & { id?: string }
			file = { ...created, file_id: created.file_id ?? created.id, relative_file_path: path }
		}
		if (!file?.file_id) throw new Error("study_topic_file_missing")
		if (marker.state === "deleting" || existing) {
			const { successes } = await getFileContentsByIds([String(file.file_id)], {
				responseType: "text",
				forceRefresh: true,
			})
			const content = successes.get(String(file.file_id))
			if (typeof content !== "string") throw new Error("study_topic_marker_read_failed")
			if (content.trim()) {
				const current = parseStudyTopicMarker(JSON.parse(content))
				if (
					!current.ok ||
					current.data.topic_id !== marker.topic_id ||
					current.data.primary_topic_id !== marker.primary_topic_id ||
					current.data.study_dir !== marker.study_dir ||
					current.data.state !== marker.state
				)
					throw new Error("study_topic_marker_conflict")
				return file
			}
		}
		const response = await SuperMagicApi.saveFileContent([
			{ file_id: String(file.file_id), content: JSON.stringify(marker, null, 2) + "\n" },
		])
		if (
			!response?.success_files?.some((item) => String(item.file_id) === String(file?.file_id))
		)
			throw new Error("study_topic_save_unconfirmed")
		return file
	} catch (originalError) {
		const cleanupErrors: unknown[] = []
		// Never remove a shared deletion intent on failure: another client may already use it.
		if (file?.file_id && !existing && marker.state === "linked") {
			try {
				const response = await SuperMagicApi.deleteFiles({
					project_id: projectId,
					file_ids: [String(file.file_id)],
				})
				if (!response?.file_ids?.map(String).includes(String(file.file_id)))
					throw new Error("study_topic_cleanup_unconfirmed")
			} catch (error) {
				cleanupErrors.push(error)
			}
		}
		throw new ResearchOperationError("link", originalError, {}, cleanupErrors)
	}
}
