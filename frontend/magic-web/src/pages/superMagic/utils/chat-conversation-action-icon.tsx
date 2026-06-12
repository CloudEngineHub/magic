import type { LucideIcon } from "lucide-react"
import { FolderInput, PenLine, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

type ChatConversationActionIconVariant = "default" | "destructive"

interface ChatConversationActionIconProps {
	actionKey: string
	variant?: ChatConversationActionIconVariant
}

/** Maps sidebar/detail chat menu keys to a single canonical action id. */
function normalizeChatConversationActionKey(actionKey: string) {
	switch (actionKey) {
		case "rename":
		case "rename-chat":
			return "rename"
		case "saveAsProject":
		case "save-as-project":
			return "saveAsProject"
		case "delete":
		case "delete-chat":
			return "delete"
		case "share-topic":
			return "share-topic"
		default:
			return null
	}
}

/** Resolves the lucide icon used across PC chat conversation dropdown menus. */
function resolveChatConversationActionIcon(actionKey: string): LucideIcon | null {
	const normalizedKey = normalizeChatConversationActionKey(actionKey)

	switch (normalizedKey) {
		case "rename":
			return PenLine
		case "saveAsProject":
			return FolderInput
		case "delete":
			return Trash2
		case "share-topic":
			return Share2
		default:
			return null
	}
}

/**
 * Menu item classes aligned with shadcn DropdownMenuItem defaults (gap-2 between icon and label).
 * Do not override gap here — DropdownMenuItem already applies items-center gap-2.
 */
export const chatConversationActionMenuItemClassName =
	"text-sm font-normal leading-5 text-foreground focus:text-foreground"

/** Delete row uses the same red-500 pairing as project-context-delete. */
export const chatConversationActionMenuItemDangerClassName =
	"text-sm font-normal leading-5 text-red-500 focus:text-red-500"

/** Renders the shared 16px icon for PC chat conversation menu items. */
export function ChatConversationActionIcon({
	actionKey,
	variant = "default",
}: ChatConversationActionIconProps) {
	const Icon = resolveChatConversationActionIcon(actionKey)
	if (!Icon) return null

	return (
		<Icon
			size={16}
			className={cn(
				"shrink-0",
				variant === "destructive" ? "text-red-500" : "text-foreground",
			)}
			aria-hidden
		/>
	)
}
