import { useTranslation } from "react-i18next"
import { Ellipsis } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import {
	ChatConversationActionIcon,
	chatConversationActionMenuItemClassName,
	chatConversationActionMenuItemDangerClassName,
} from "@/pages/superMagic/utils/chat-conversation-action-icon"

export interface ChatConversationMenuAction {
	key: string
	label: string
	onClick: () => void
	disabled?: boolean
	variant?: "default" | "danger"
}

interface ChatConversationMoreMenuProps {
	actions: ChatConversationMenuAction[]
}

/**
 * Desktop chat detail overflow menu: share/rename/save-as/delete conversation actions.
 */
export function ChatConversationMoreMenu({ actions }: ChatConversationMoreMenuProps) {
	const { t } = useTranslation("sidebar")
	const regularActions = actions.filter((action) => action.variant !== "danger")
	const dangerActions = actions.filter((action) => action.variant === "danger")
	const shouldShowDangerSeparator = regularActions.length > 0 && dangerActions.length > 0

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="!size-6 !min-h-6 !min-w-6 !rounded-md !p-0"
					aria-label={t("appsMenu.more")}
					data-testid="chat-conversation-more-button"
				>
					<Ellipsis className="size-4 shrink-0 text-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{/* Keep destructive chat actions in a dedicated visual group. */}
				{regularActions.map((action) => (
					<DropdownMenuItem
						key={action.key}
						disabled={action.disabled}
						variant="default"
						className={chatConversationActionMenuItemClassName}
						onClick={action.onClick}
						data-testid={`chat-conversation-more-action-${action.key}`}
					>
						<ChatConversationActionIcon actionKey={action.key} />
						{action.label}
					</DropdownMenuItem>
				))}
				{shouldShowDangerSeparator ? (
					<DropdownMenuSeparator
						className="-mx-1 my-1 bg-border"
						data-testid="chat-conversation-more-delete-separator"
					/>
				) : null}
				{dangerActions.map((action) => (
					<DropdownMenuItem
						key={action.key}
						disabled={action.disabled}
						variant="destructive"
						className={chatConversationActionMenuItemDangerClassName}
						onClick={action.onClick}
						data-testid={`chat-conversation-more-action-${action.key}`}
					>
						<ChatConversationActionIcon actionKey={action.key} variant="destructive" />
						{action.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
