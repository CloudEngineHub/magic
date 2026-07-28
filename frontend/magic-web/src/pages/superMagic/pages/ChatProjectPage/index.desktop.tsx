import { lazy, Suspense, useEffect } from "react"
import { observer } from "mobx-react-lite"
import { useParams } from "react-router"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import {
	isChatProjectRouteContextReady,
	shouldRefreshChatProjectStateOnDesktop,
} from "@/pages/superMagic/services/topicProjectConsistency"
import {
	FileActionVisibilityProvider,
	HIDE_CLAW_FILE_ACTIONS,
} from "@/pages/superMagic/providers/file-action-visibility-provider"
import { useChatExpertSwitch } from "@/pages/superMagic/hooks/useChatExpertSwitch"
import ChatProjectPageDesktopSkeleton from "@/pages/superMagic/lazy/skeleton/ChatProjectPageDesktopSkeleton"
import { isReadOnlyProject } from "@/pages/superMagic/utils/permission"

const TopicPageDesktop = lazy(() => import("@/pages/superMagic/pages/TopicPage/index.desktop"))

/**
 * Desktop chat detail route restores project/topic state from URL then renders chat variant TopicPage.
 */
function ChatProjectPageDesktop() {
	const { projectId, topicId } = useParams()
	const selectedProjectId = projectStore.selectedProject?.id
	const selectedWorkspaceId = workspaceStore.selectedWorkspace?.id
	const selectedTopic = topicStore.selectedTopic
	const loadedProjects = projectStore.projects
	const isSelectedProjectReadOnly = isReadOnlyProject(projectStore.selectedProject?.user_role)
	const isDesktopChatSwitchInProgress = SuperMagicService.isDesktopChatSwitchInProgress()
	const isRouteContextReady = isChatProjectRouteContextReady({
		projectId,
		routeTopicId: topicId,
		selectedProjectId,
		selectedWorkspaceId,
		selectedTopic,
		loadedProjects,
		isSelectedProjectReadOnly,
	})

	useEffect(() => {
		if (
			!shouldRefreshChatProjectStateOnDesktop({
				projectId,
				routeTopicId: topicId,
				selectedProjectId,
				selectedWorkspaceId,
				selectedTopic,
				loadedProjects: projectStore.projects,
				isSelectedProjectReadOnly,
				isDesktopChatSwitchInProgress,
			})
		) {
			return
		}

		// Cold start / hard refresh only: active sidebar switches are owned by switchChatProjectInDesktop.
		void SuperMagicService.refreshState({ projectId, topicId })
	}, [
		projectId,
		topicId,
		selectedProjectId,
		selectedWorkspaceId,
		selectedTopic,
		isSelectedProjectReadOnly,
		isDesktopChatSwitchInProgress,
	])

	useChatExpertSwitch()

	// 乐观切换仍由 service 完成数据请求；页面只负责在完整上下文到达前保持骨架态。
	if (!isRouteContextReady) {
		return <ChatProjectPageDesktopSkeleton />
	}

	return (
		<FileActionVisibilityProvider value={HIDE_CLAW_FILE_ACTIONS}>
			<Suspense fallback={<ChatProjectPageDesktopSkeleton />}>
				<div
					className="flex h-full min-h-0 w-full flex-col"
					data-testid="chat-project-page-desktop"
				>
					<TopicPageDesktop pageVariant="singleTopicChat" />
				</div>
			</Suspense>
		</FileActionVisibilityProvider>
	)
}

export default observer(ChatProjectPageDesktop)
