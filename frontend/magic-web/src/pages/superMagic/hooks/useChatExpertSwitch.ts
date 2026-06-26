import { useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useChatWorkspace } from "@/pages/superMagic/hooks/useChatWorkspace"
import SuperMagicService from "@/pages/superMagic/services"
import ProjectTopicService from "@/services/superMagic/ProjectTopicService"
import type { SuperMagicCreateNewTopicPayload } from "@/pages/superMagic/events/message"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

/**
 * Intercepts employee/mode switches on chat detail pages and creates a new chat
 * project instead of a sibling topic inside the current project.
 */
export function useChatExpertSwitch() {
	const { chatWorkspace, createProjectInChatWorkspace, ensureChatWorkspace } = useChatWorkspace({
		projectPageSize: 1,
	})

	const handleCreateNewChatOnExpertSwitch = useMemoizedFn(
		async (payload?: SuperMagicCreateNewTopicPayload) => {
			const targetMode = payload?.topicMode as TopicMode | undefined
			if (!targetMode) return

			const createdProject = await createProjectInChatWorkspace({ projectMode: targetMode })
			if (!createdProject?.project || !createdProject.topic) return

			// Pre-write target mode so useTopicMode does not fall back to the global default.
			ProjectTopicService.setProjectDefaultTopicMode(
				createdProject.project.workspace_id,
				createdProject.project.id,
				targetMode,
			)

			const resolvedChatWorkspace = chatWorkspace ?? (await ensureChatWorkspace())

			// Use the public chat switcher so desktop and mobile keep their own navigation contracts.
			await SuperMagicService.switchChatProject(
				createdProject.project,
				createdProject.topic,
				{
					chatWorkspace: resolvedChatWorkspace,
				},
			)
		},
	)

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Create_New_Topic, handleCreateNewChatOnExpertSwitch)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Create_New_Topic, handleCreateNewChatOnExpertSwitch)
		}
	}, [handleCreateNewChatOnExpertSwitch])
}
