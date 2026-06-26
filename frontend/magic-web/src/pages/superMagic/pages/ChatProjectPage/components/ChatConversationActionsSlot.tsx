import { useMemo } from "react"
import { observer } from "mobx-react-lite"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import { useDesktopChatConversationActions } from "@/pages/superMagic/pages/ChatProjectPage/hooks/useDesktopChatConversationActions"
import { ChatConversationMoreMenu } from "./ChatConversationMoreMenu"

/**
 * Wires chat conversation actions into MessageHeader: overflow menu plus PC dialogs.
 */
function ChatConversationActionsSlotComponent() {
	const selectedProject = projectStore.selectedProject
	const selectedTopic = topicStore.selectedTopic
	const { conversationActionGroups, projectActionComponents, topicActionComponents } =
		useDesktopChatConversationActions({
			selectedProject,
			selectedTopic,
		})

	const flatActions = useMemo(
		() => conversationActionGroups.flatMap((group) => group.actions),
		[conversationActionGroups],
	)

	return (
		<>
			<ChatConversationMoreMenu actions={flatActions} />
			{projectActionComponents}
			{topicActionComponents}
		</>
	)
}

export const ChatConversationActionsSlot = observer(ChatConversationActionsSlotComponent)
