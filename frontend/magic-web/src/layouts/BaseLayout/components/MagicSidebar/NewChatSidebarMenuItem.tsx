import { useEffect, useRef, useState } from "react"
import { MessageCirclePlus } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import magicToast from "@/components/base/MagicToaster/utils"
import SuperMagicService from "@/pages/superMagic/services"
import { useChatWorkspace } from "@/pages/superMagic/hooks/useChatWorkspace"
import { roleStore } from "@/pages/superMagic/stores"
import { resolveProjectModeForCreate } from "@/services/superMagic/DefaultAgentSelectionService"
import { invalidateChatConversationList } from "@/pages/superMagic/services/chatConversationListInvalidation"

interface NewChatSidebarMenuItemProps {
	collapsed: boolean
	onBusyChange?: (busy: boolean) => void
	onSelect?: () => void
}

/** Fixed global-sidebar action for creating a conversation without opening the workspace list. */
function NewChatSidebarMenuItem({
	collapsed,
	onBusyChange,
	onSelect,
}: NewChatSidebarMenuItemProps) {
	const { t } = useTranslation(["sidebar", "super"])
	const { chatWorkspace, createProjectInChatWorkspace, ensureChatWorkspace } = useChatWorkspace({
		workspaceEnabled: false,
	})
	const [isCreating, setIsCreating] = useState(false)
	const creatingRef = useRef(false)
	const currentRole = roleStore.currentRole

	useEffect(() => {
		onBusyChange?.(isCreating)
	}, [isCreating, onBusyChange])
	useEffect(() => () => onBusyChange?.(false), [onBusyChange])

	async function handleCreateChat() {
		if (creatingRef.current) return
		creatingRef.current = true
		setIsCreating(true)
		try {
			const createdProject = await createProjectInChatWorkspace({
				projectMode: resolveProjectModeForCreate(currentRole),
			})
			if (!createdProject?.project || !createdProject.topic) {
				magicToast.error(t("super:hierarchicalWorkspacePopup.createProjectFailed"))
				return
			}

			const resolvedChatWorkspace = chatWorkspace ?? (await ensureChatWorkspace())
			await SuperMagicService.switchChatProject(
				createdProject.project,
				createdProject.topic,
				{
					chatWorkspace: resolvedChatWorkspace,
				},
			)
			invalidateChatConversationList()
			onSelect?.()
		} catch {
			magicToast.error(t("super:hierarchicalWorkspacePopup.createProjectFailed"))
		} finally {
			creatingRef.current = false
			setIsCreating(false)
		}
	}

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				type="button"
				tooltip={collapsed ? t("sidebar:chats.newChat") : undefined}
				disabled={isCreating}
				aria-busy={isCreating}
				data-testid="sidebar-content-new-chat-button"
				className="text-sidebar-foreground"
				onClick={() => void handleCreateChat()}
			>
				<MessageCirclePlus className="h-4 w-4 shrink-0" />
				<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
					{t("sidebar:chats.newChat")}
				</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}

export default observer(NewChatSidebarMenuItem)
