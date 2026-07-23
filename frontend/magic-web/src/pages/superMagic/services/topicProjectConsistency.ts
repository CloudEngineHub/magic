import type { Topic, ProjectListItem } from "../pages/Workspace/types"

/**
 * Returns true when a loaded project list no longer contains the route project id (e.g. after delete).
 */
export function wasProjectRemovedFromLoadedList(
	projectId: string,
	loadedProjects: ProjectListItem[],
): boolean {
	if (!projectId || loadedProjects.length === 0) return false

	return !loadedProjects.some((project) => project.id === projectId)
}

/**
 * 统一判断当前话题是否仍然属于目标项目，避免移动端 chat 项目页继续复用旧会话状态。
 */
export function isTopicBoundToProject(
	topic: Topic | null | undefined,
	projectId: string | null | undefined,
): boolean {
	if (!topic?.id || !projectId) {
		return false
	}

	return topic.project_id === projectId
}

interface TopicRouteContextParams {
	projectId: string | undefined
	routeTopicId: string | undefined
	selectedProjectId: string | undefined
	selectedTopic: Topic | null | undefined
}

interface MainLayoutRouteRestoreParams extends TopicRouteContextParams {
	isChatProjectRoute: boolean
	workspaceId: string | undefined
	selectedWorkspaceId: string | undefined
}

/**
 * 话题详情页只有在项目、话题归属和聊天会话映射都完整时才允许挂载真实内容。
 * 列表态话题可能只有展示字段，因此仅比较 id 会让消息区和输入框提前进入空状态。
 */
export function isTopicRouteContextReady({
	projectId,
	routeTopicId,
	selectedProjectId,
	selectedTopic,
}: TopicRouteContextParams): boolean {
	if (!projectId || !routeTopicId) {
		return false
	}

	return Boolean(
		selectedProjectId === projectId &&
		selectedTopic?.id === routeTopicId &&
		isTopicBoundToProject(selectedTopic, projectId) &&
		selectedTopic.chat_conversation_id &&
		selectedTopic.chat_topic_id,
	)
}

/**
 * MainLayout only restores workspace/project topic routes. Chat detail routes own their
 * refresh lifecycle in ChatProjectPage so initializeState and refreshState cannot race.
 */
export function shouldRestoreRouteStateFromMainLayout({
	isChatProjectRoute,
	workspaceId,
	projectId,
	routeTopicId,
	selectedWorkspaceId,
	selectedProjectId,
	selectedTopic,
}: MainLayoutRouteRestoreParams): boolean {
	if (isChatProjectRoute) {
		return false
	}

	return Boolean(
		(workspaceId && selectedWorkspaceId !== workspaceId) ||
		(projectId && selectedProjectId !== projectId) ||
		(routeTopicId &&
			!isTopicRouteContextReady({
				projectId,
				routeTopicId,
				selectedProjectId,
				selectedTopic,
			})),
	)
}

interface ChatProjectRouteContextParams {
	projectId: string | undefined
	routeTopicId: string | undefined
	selectedProjectId: string | undefined
	selectedWorkspaceId: string | undefined
	selectedTopic: Topic | null | undefined
	loadedProjects?: ProjectListItem[]
	/** Read-only projects do not restore a selected topic. */
	isSelectedProjectReadOnly?: boolean
}

/**
 * Chat 项目路由的真实页面门禁。删除后的旧 URL 不应被骨架永久拦住，
 * 其余场景必须等待项目、工作区和完整话题上下文恢复完成。
 */
export function isChatProjectRouteContextReady({
	projectId,
	routeTopicId,
	selectedProjectId,
	selectedWorkspaceId,
	selectedTopic,
	loadedProjects = [],
	isSelectedProjectReadOnly = false,
}: ChatProjectRouteContextParams): boolean {
	if (!projectId) {
		return true
	}

	if (selectedProjectId !== projectId) {
		return wasProjectRemovedFromLoadedList(projectId, loadedProjects)
	}

	if (!selectedWorkspaceId) {
		return false
	}

	if (isSelectedProjectReadOnly) {
		return true
	}

	if (!selectedTopic?.id || (routeTopicId && selectedTopic.id !== routeTopicId)) {
		return false
	}

	return Boolean(
		isTopicBoundToProject(selectedTopic, projectId) &&
		selectedTopic.chat_conversation_id &&
		selectedTopic.chat_topic_id,
	)
}

/**
 * 只有项目、工作区、话题三者都已经对齐时，chat 项目路由才允许跳过状态恢复。
 */
export function shouldRefreshChatProjectState({
	projectId,
	routeTopicId,
	selectedProjectId,
	selectedWorkspaceId,
	selectedTopic,
	loadedProjects = [],
	isSelectedProjectReadOnly = false,
}: ChatProjectRouteContextParams): boolean {
	return !isChatProjectRouteContextReady({
		projectId,
		routeTopicId,
		selectedProjectId,
		selectedWorkspaceId,
		selectedTopic,
		loadedProjects,
		isSelectedProjectReadOnly,
	})
}

interface ShouldRefreshChatProjectStateOnDesktopParams {
	projectId: string | undefined
	routeTopicId: string | undefined
	selectedProjectId: string | undefined
	selectedWorkspaceId: string | undefined
	selectedTopic: Topic | null | undefined
	loadedProjects?: ProjectListItem[]
	isSelectedProjectReadOnly?: boolean
	/** True while switchChatProjectInDesktop optimistic navigation is in flight. */
	isDesktopChatSwitchInProgress?: boolean
}

/**
 * Desktop chat detail refresh: skip URL recovery while the service is actively switching
 * to another project/topic, but keep cold-start and hard-refresh recovery via refreshState.
 */
export function shouldRefreshChatProjectStateOnDesktop({
	isDesktopChatSwitchInProgress = false,
	selectedProjectId,
	projectId,
	...rest
}: ShouldRefreshChatProjectStateOnDesktopParams): boolean {
	if (isDesktopChatSwitchInProgress) {
		return false
	}

	return shouldRefreshChatProjectState({
		projectId,
		selectedProjectId,
		...rest,
	})
}

/**
 * 发送前若发现当前话题不属于选中项目，需要先补齐正确的话题上下文再继续发送。
 */
export function shouldCreateFreshTopicForProject(
	project: ProjectListItem | null | undefined,
	topic: Topic | null | undefined,
): boolean {
	if (!project?.id) {
		return false
	}

	return !isTopicBoundToProject(topic, project.id)
}
