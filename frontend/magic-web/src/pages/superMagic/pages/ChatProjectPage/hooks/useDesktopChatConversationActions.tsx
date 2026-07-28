import { useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { computed } from "mobx"
import { useTranslation } from "react-i18next"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useDesktopChatProjectActions } from "@/pages/superMagic/hooks/useDesktopChatProjectActions"
import ShareModal from "@/pages/superMagic/components/Share/Modal"
import { ResourceType, ShareType } from "@/pages/superMagic/components/Share/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import { isTopicShareAllowed } from "@/pages/superMagic/utils/is-topic-share-allowed"

interface DesktopConversationAction {
	key: string
	label: string
	onClick: () => void
	disabled?: boolean
	isPinned?: boolean
	variant?: "default" | "danger"
}

interface UseDesktopChatConversationActionsParams {
	selectedProject: ProjectListItem | null
	selectedTopic: Topic | null
}

/**
 * Desktop chat detail header actions using PC dialogs for rename/save/delete flows.
 */
export function useDesktopChatConversationActions({
	selectedProject,
	selectedTopic,
}: UseDesktopChatConversationActionsParams) {
	const { t } = useTranslation("super")
	const [shareModalOpen, setShareModalOpen] = useState(false)
	const { projectActions, projectActionMap, projectActionComponents, updateCurrentActionItem } =
		useDesktopChatProjectActions({
			actionContext: "detail",
			selectedTopic,
		})

	/** Mirror MessageHeader: share eligibility follows the current visible message branch. */
	const messages = useMemo(
		() =>
			computed(() =>
				selectedTopic?.chat_topic_id
					? superMagicStore.messages?.get(selectedTopic.chat_topic_id) || []
					: [],
			),
		[selectedTopic?.chat_topic_id],
	).get()
	const isAllowShare = useMemo(() => isTopicShareAllowed(messages), [messages])

	/** Ensure project-scoped dialogs always receive the active conversation project. */
	const syncProjectContext = useMemoizedFn(() => {
		if (!selectedProject) return
		updateCurrentActionItem(selectedProject)
	})

	const runProjectAction = useMemoizedFn(
		(actionKey: "pinProject" | "rename" | "saveAsProject" | "delete") => {
			syncProjectContext()
			projectActionMap.get(actionKey)?.onClick?.()
		},
	)

	const openTopicShare = useMemoizedFn(() => {
		if (!selectedTopic || !selectedProject || !isAllowShare) return
		setShareModalOpen(true)
	})

	const conversationActionGroups = useMemo(
		() => [
			{
				actions: [
					{
						key: "share-topic",
						label: t("share.shareConversation"),
						onClick: openTopicShare,
						disabled: !selectedTopic || !selectedProject || !isAllowShare,
					},
				] satisfies DesktopConversationAction[],
			},
			{
				actions: projectActions.map((action) => ({
					key: action.key,
					label: action.label,
					onClick: () => runProjectAction(action.key),
					isPinned:
						action.key === "pinProject" ? Boolean(selectedProject?.is_pinned) : false,
					variant: action.variant,
				})),
			},
		],
		[
			isAllowShare,
			openTopicShare,
			projectActions,
			runProjectAction,
			selectedProject,
			selectedTopic,
			t,
		],
	)

	const topicActionComponents =
		selectedTopic && selectedProject ? (
			<ShareModal
				open={shareModalOpen}
				types={[ShareType.Public, ShareType.PasswordProtected, ShareType.Organization]}
				shareContext={{
					resource_id: selectedTopic.id,
					resource_type: ResourceType.Topic,
				}}
				topicTitle={selectedTopic.topic_name}
				onCancel={() => setShareModalOpen(false)}
			/>
		) : null

	return {
		conversationActionGroups,
		projectActionComponents,
		topicActionComponents,
	}
}
