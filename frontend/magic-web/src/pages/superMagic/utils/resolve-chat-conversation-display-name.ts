import type { TFunction } from "i18next"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { isCachedChatWorkspaceProject } from "@/pages/superMagic/utils/isChatWorkspaceProject"

interface ResolveChatConversationDisplayNameParams {
	topic?: Pick<Topic, "topic_name"> | null
	project?: Pick<ProjectListItem, "workspace_id" | "project_name"> | null
	t: TFunction<"super">
	/** When false, returns empty string instead of the unnamed-chat fallback (for rename inputs). */
	includeFallback?: boolean
}

/**
 * Returns whether chat conversation naming rules apply (same boundary as rename dual-write).
 */
export function shouldUseChatConversationDisplayName(
	project: Pick<ProjectListItem, "workspace_id"> | null | undefined,
): boolean {
	return isCachedChatWorkspaceProject(project)
}

/**
 * Resolves the visible chat conversation title: topic_name → project_name → unnamed fallback.
 */
export function resolveChatConversationDisplayName({
	topic,
	project,
	t,
	includeFallback = true,
}: ResolveChatConversationDisplayNameParams): string {
	const topicName = topic?.topic_name?.trim()
	if (topicName) return topicName

	const projectName = project?.project_name?.trim()
	if (projectName) return projectName

	return includeFallback ? t("chat.unnamedChat") : ""
}

/**
 * Resolves MessageHeader title: chat workspace projects use conversation naming; others use topic fallback.
 */
export function resolveMessageHeaderTitle({
	topic,
	project,
	t,
}: Omit<ResolveChatConversationDisplayNameParams, "includeFallback">): string {
	if (shouldUseChatConversationDisplayName(project)) {
		return resolveChatConversationDisplayName({ topic, project, t, includeFallback: true })
	}

	return topic?.topic_name?.trim() || t("messageHeader.untitledTopic")
}

/**
 * Resolves the editable rename baseline without i18n placeholder text in the input field.
 */
export function resolveMessageHeaderEditableTitle({
	topic,
	project,
	t,
}: Omit<ResolveChatConversationDisplayNameParams, "includeFallback">): string {
	if (shouldUseChatConversationDisplayName(project)) {
		return resolveChatConversationDisplayName({ topic, project, t, includeFallback: false })
	}

	return topic?.topic_name?.trim() || ""
}
