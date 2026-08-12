import { memo, type PropsWithChildren, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import type { SuperMagicMessageItem } from "./type"
import { getMessageNodeKey } from "./helpers"
import { isUserRoleMessage, isToolRoleMessage, type MessageTurnGroup } from "./message-turn-groups"
import { superMagicStore } from "@/pages/superMagic/stores"
import MessageRenderErrorBoundary from "./components/MessageRenderErrorBoundary"

export const USER_MESSAGE_STICKY_POSITION_CLASS = "sticky z-20"

export const USER_MESSAGE_STICKY_MASK_CLASS = cn(
	"isolate overflow-visible",
	"[--sticky-message-mask-bg:rgb(var(--sidebar-rgb))] [--sticky-message-mask-fade-from:rgb(var(--sidebar-rgb))]",
	"before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[var(--sticky-message-mask-bg)] before:content-['']",
	"after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:z-0 after:h-4 after:bg-gradient-to-b after:from-[var(--sticky-message-mask-fade-from)] after:to-transparent after:content-['']",
	"[&>*]:relative [&>*]:z-[1]",
)

export const USER_MESSAGE_STICKY_OVERLAY_CLASS = cn(
	USER_MESSAGE_STICKY_POSITION_CLASS,
	USER_MESSAGE_STICKY_MASK_CLASS,
)

/** Mobile keeps the same sticky User row but uses the mobile page background without a fade tail. */
export const USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE = cn(
	"before:bg-[rgb(var(--mobile-background-rgb))]",
	"after:bg-none",
)

export function getUserMessageStickyTopClass(
	isMobile: boolean,
): "top-0 [--sticky-message-top:0px]" | "top-[40px] [--sticky-message-top:40px]" {
	return isMobile ? "top-0 [--sticky-message-top:0px]" : "top-[40px] [--sticky-message-top:40px]"
}

/** Extra classes applied to the row wrapper when the message is from the user */
export const USER_MESSAGE_ROW_CLASS = "flex min-w-0 justify-end"

/**
 * Assistant content keeps a timeline gutter, while terminal status badges cancel only that
 * gutter through the inherited CSS variable so they align with top-level Tool statuses.
 */
export const ASSISTANT_MESSAGE_ROW_CLASS =
	"pb-2 pl-6 [--message-status-offset:-1.5rem] after:absolute after:left-[11px] after:top-0 after:z-[-1] after:h-full after:w-px after:border-l after:border-dashed after:border-border after:content-['']"

export interface MessageTurnGroupListProps {
	groups: Array<MessageTurnGroup>
	isMobile: boolean
	stickyMessageClassName?: string
	/** Inner message UI (e.g. Node); wrapped with user right-align + sticky section */
	renderNode: (args: { node: SuperMagicMessageItem; index: number }) => ReactNode
	/** Export-selection mode: render a left checkbox column per selectable turn */
	exportMode?: boolean
	selectedKeys?: ReadonlySet<string>
	onToggleSelect?: (key: string) => void
	limitReached?: boolean
}

interface MessageRenderRowProps {
	renderNode: MessageTurnGroupListProps["renderNode"]
	node: SuperMagicMessageItem
	index: number
	nodeKey: string
	isUser: boolean
	isTool: boolean
}

interface MessageRowContainerProps extends PropsWithChildren {
	node: SuperMagicMessageItem
	nodeKey: string
	isUser: boolean
	isTool: boolean
}

function MessageRowContainer({
	node,
	nodeKey,
	isUser,
	isTool,
	children,
}: MessageRowContainerProps) {
	return (
		<div
			data-message-id={nodeKey}
			data-message-role={node?.role || "user"}
			className={cn(
				"relative w-full",
				!isUser && !isTool && ASSISTANT_MESSAGE_ROW_CLASS,
				isUser && USER_MESSAGE_ROW_CLASS,
			)}
		>
			{children}
		</div>
	)
}

function MessageRenderRow({
	renderNode,
	node,
	index,
	nodeKey,
	isUser,
	isTool,
}: MessageRenderRowProps) {
	const inner = renderNode({ node, index })
	if (inner == null || inner === false) return null

	return (
		<MessageRowContainer node={node} nodeKey={nodeKey} isUser={isUser} isTool={isTool}>
			{inner}
		</MessageRowContainer>
	)
}

const statusList = new Set(["completed", "failed", "error", "finished", "suspended"])

function MessageTurnGroupListInner({
	groups,
	isMobile,
	stickyMessageClassName,
	renderNode,
	exportMode,
	selectedKeys,
	onToggleSelect,
	limitReached,
}: MessageTurnGroupListProps) {
	const userMessageStickyTopClass = getUserMessageStickyTopClass(isMobile)

	function row(node: SuperMagicMessageItem, index: number) {
		const nodeKey = getMessageNodeKey(node) || `${node?.role || "message"}-${index}`
		const card = superMagicStore.getMessageNode(node?.super_message_id) as
			{ status?: string } | undefined
		if (!statusList.has(card?.status as string) && node?.role === "tool") {
			return null
		}
		const isUser = isUserRoleMessage(node)
		const isTool = isToolRoleMessage(node)
		const wrapMessageRow = (content: ReactNode) => (
			<MessageRowContainer node={node} nodeKey={nodeKey} isUser={isUser} isTool={isTool}>
				{content}
			</MessageRowContainer>
		)
		return (
			<MessageRenderErrorBoundary
				key={nodeKey}
				messageKey={nodeKey}
				fallbackWrapper={wrapMessageRow}
				resetKey={
					typeof node?.content === "string"
						? node.content
						: typeof node?.status === "string"
							? node.status
							: undefined
				}
			>
				<MessageRenderRow
					renderNode={renderNode}
					node={node}
					index={index}
					nodeKey={nodeKey}
					isUser={isUser}
					isTool={isTool}
				/>
			</MessageRenderErrorBoundary>
		)
	}

	function selectionWrap(group: MessageTurnGroup, content: ReactNode): ReactNode {
		if (!exportMode) return content
		const selectable = group.stickyItem != null
		const checked = selectable ? Boolean(selectedKeys?.has(group.key)) : false
		const disabled = selectable && !checked && Boolean(limitReached)

		return (
			<div
				className={cn(
					"group/export relative rounded-lg py-1 pl-9 pr-1 transition-colors duration-150",
					selectable && !disabled && "cursor-pointer",
					selectable && !checked && !disabled && "hover:bg-muted/30",
					disabled && "cursor-not-allowed opacity-55",
				)}
			>
				{selectable && (
					<div
						className={cn(
							"pointer-events-auto absolute left-0 top-4 z-40 flex size-7 items-center justify-center transition-opacity duration-150",
							checked ? "opacity-100" : "opacity-80 group-hover/export:opacity-100",
						)}
					>
						<Checkbox
							checked={checked}
							disabled={disabled}
							className="size-4"
							onCheckedChange={() => onToggleSelect?.(group.key)}
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
				)}
				<div
					className={cn(
						"min-w-0 transition-opacity duration-150",
						checked && "opacity-95",
					)}
				>
					{content}
				</div>
				{selectable && (
					<div
						className={cn(
							"absolute inset-0 z-30 rounded-lg transition-colors duration-150",
							!disabled && "hover:bg-primary/[0.02]",
						)}
						onClick={() => {
							if (disabled) return
							onToggleSelect?.(group.key)
						}}
					/>
				)}
			</div>
		)
	}

	return (
		<>
			{groups.map((group) => {
				if (!group.stickyItem) {
					const content = (
						<div className="relative flex flex-col gap-2">
							{group.items.map(({ node, index }) => row(node, index))}
						</div>
					)
					return <div key={group.key}>{selectionWrap(group, content)}</div>
				}

				const { stickyItem, items } = group
				const stickyNodeKey =
					getMessageNodeKey(stickyItem.node) ||
					`${stickyItem.node?.role || "message"}-${stickyItem.index}`

				const inner = (
					<section className="relative flex flex-col">
						<div
							data-sticky-message-id={stickyNodeKey}
							className={cn(
								USER_MESSAGE_STICKY_OVERLAY_CLASS,
								isMobile && USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
								userMessageStickyTopClass,
								stickyMessageClassName,
								isMobile ? "z-40 bg-mobile-background pb-2" : "mb-2",
							)}
						>
							{row(stickyItem.node, stickyItem.index)}
						</div>
						{items.slice(1).map(({ node, index }) => row(node, index))}
					</section>
				)

				return <div key={group.key}>{selectionWrap(group, inner)}</div>
			})}
		</>
	)
}

export const MessageTurnGroupList = memo(MessageTurnGroupListInner)
