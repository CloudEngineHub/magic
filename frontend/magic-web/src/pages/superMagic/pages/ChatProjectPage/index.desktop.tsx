import { lazy, Suspense, useEffect } from "react"
import { observer } from "mobx-react-lite"
import { useParams } from "react-router"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import { shouldRefreshChatProjectStateOnDesktop } from "@/pages/superMagic/services/topicProjectConsistency"
import {
	FileActionVisibilityProvider,
	HIDE_CLAW_FILE_ACTIONS,
} from "@/pages/superMagic/providers/file-action-visibility-provider"
import { useChatExpertSwitch } from "@/pages/superMagic/hooks/useChatExpertSwitch"

const TopicPageDesktop = lazy(() => import("@/pages/superMagic/pages/TopicPage/index.desktop"))

/**
 * Desktop chat detail route restores project/topic state from URL then renders chat variant TopicPage.
 */
function ChatProjectPageDesktop() {
	const { projectId, topicId } = useParams()
	const selectedProjectId = projectStore.selectedProject?.id
	const selectedWorkspaceId = workspaceStore.selectedWorkspace?.id
	const selectedTopic = topicStore.selectedTopic

	useEffect(() => {
		if (
			!shouldRefreshChatProjectStateOnDesktop({
				projectId,
				routeTopicId: topicId,
				selectedProjectId,
				selectedWorkspaceId,
				selectedTopic,
				loadedProjects: projectStore.projects,
				isDesktopChatSwitchInProgress: SuperMagicService.isDesktopChatSwitchInProgress(),
			})
		) {
			return
		}

		// Cold start / hard refresh only: active sidebar switches are owned by switchChatProjectInDesktop.
		void SuperMagicService.refreshState({ projectId, topicId })
	}, [projectId, topicId, selectedProjectId, selectedWorkspaceId, selectedTopic])

	useChatExpertSwitch()

	return (
		<FileActionVisibilityProvider value={HIDE_CLAW_FILE_ACTIONS}>
			<div
				className="flex h-full min-h-0 w-full flex-col"
				data-testid="chat-project-page-desktop"
			>
				<Suspense fallback={null}>
					<TopicPageDesktop pageVariant="singleTopicChat" />
				</Suspense>
			</div>
		</FileActionVisibilityProvider>
	)
}

export default observer(ChatProjectPageDesktop)
