import type { AudioProjectListItem } from "@/types/audioProject"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

/** Uses project detail as the source of truth for project metadata while preserving audio-specific fields from audio-projects. */
export function mergeProjectDetailIntoAudioItem(
	item: AudioProjectListItem | null,
	projectDetail: ProjectListItem | null,
): AudioProjectListItem | null {
	if (!item && !projectDetail) return null
	if (!item) return null
	if (!projectDetail) return item

	return {
		...item,
		project_name: projectDetail.project_name || item.project_name,
		workspace_id: projectDetail.workspace_id || item.workspace_id,
		workspace_name: projectDetail.workspace_name || item.workspace_name,
		project_status: projectDetail.project_status || item.project_status,
		current_topic_status: projectDetail.current_topic_status || item.current_topic_status,
	}
}
