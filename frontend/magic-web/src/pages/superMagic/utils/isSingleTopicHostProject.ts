import type { ProjectListItem } from "../pages/Workspace/types"
import { TopicMode } from "../pages/Workspace/TopicMode"

const SINGLE_TOPIC_HOST_MODES = new Set<TopicMode>([TopicMode.MagiClaw, TopicMode.Chat])

export function isSingleTopicHostProject(
	project?: Pick<ProjectListItem, "project_mode"> | null,
): boolean {
	return Boolean(project?.project_mode && SINGLE_TOPIC_HOST_MODES.has(project.project_mode))
}

export function resolveIframeHostTopicMode(
	project?: Pick<ProjectListItem, "project_mode"> | null,
): TopicMode {
	if (project?.project_mode === TopicMode.MagiClaw) return TopicMode.MagiClaw
	if (project?.project_mode === TopicMode.Chat) return TopicMode.Chat
	return TopicMode.MicroApp
}
