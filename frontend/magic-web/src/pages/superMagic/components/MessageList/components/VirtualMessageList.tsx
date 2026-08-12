import { memo, type MutableRefObject, type ReactNode, useMemo } from "react"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/lib/utils"
import { superMagicStore } from "@/pages/superMagic/stores"
import { observer } from "mobx-react-lite"
import MessageRenderErrorBoundary from "./MessageRenderErrorBoundary"
import {
	ASSISTANT_MESSAGE_ROW_CLASS,
	USER_MESSAGE_ROW_CLASS,
	USER_MESSAGE_STICKY_MASK_CLASS,
	USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
	USER_MESSAGE_STICKY_POSITION_CLASS,
	getUserMessageStickyTopClass,
} from "../MessageTurnGroupList"
import {
	createStickyRangeExtractor,
	findActiveStickyIndex,
	type VirtualMessageItem,
} from "../virtual-message-items"
import { MessageViewStateScopeProvider } from "../view-state/MessageViewStateContext"

const terminalToolStatuses = new Set(["completed", "failed", "error", "finished", "suspended"])
const MESSAGE_ROW_SPACING = 8

export interface VirtualMessageListProps {
	topicId?: string
	items: Array<VirtualMessageItem>
	userIndices: Array<number>
	isMobile: boolean
	getScrollElement: () => HTMLDivElement | null
	renderNode: (args: { item: VirtualMessageItem }) => ReactNode
	stickyMessageClassName?: string
	/** Disable the shared mobile mask when a caller needs the desktop mask appearance. */
	useMobileStickyOverlay?: boolean
	exportMode?: boolean
	selectedKeys?: ReadonlySet<string>
	onToggleSelect?: (key: string) => void
	limitReached?: boolean
	virtualizerRef?: MutableRefObject<Virtualizer<HTMLDivElement, HTMLDivElement> | null>
	onVirtualizerChange?: (
		instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
		sync: boolean,
	) => void
}

const VirtualMessageRenderRow = observer(function VirtualMessageRenderRow({
	item,
	topicId,
	renderNode,
}: {
	item: VirtualMessageItem
	topicId?: string
	renderNode: VirtualMessageListProps["renderNode"]
}) {
	// The revision read is the row's only Store subscription. Updating another message
	// must not force this visible row to rebuild its Markdown/tool subtree.
	const superMessageId = item.node?.super_message_id || ""
	void (topicId && superMagicStore.getMessageRevision(topicId, superMessageId))
	const canonicalNode = superMessageId
		? (((topicId
				? superMagicStore.getTopicMessageNode?.(topicId, superMessageId)
				: undefined) || superMagicStore.getMessageNode(superMessageId)) as
				Record<string, unknown> | undefined)
		: undefined
	if (item.isTool && !terminalToolStatuses.has(String(canonicalNode?.status || ""))) {
		// Keep a measured zero-height anchor in the virtualizer. Removing the row
		// altogether leaves its old estimate in TanStack's measurement cache and
		// creates a phantom gap until the next full layout pass.
		return (
			<div
				data-virtual-message-hidden="true"
				aria-hidden
				className="h-0 w-full overflow-hidden"
				style={{ height: 0 }}
			/>
		)
	}
	const effectiveItem = canonicalNode
		? ({
				...item,
				node: {
					...item.node,
					...canonicalNode,
					// Historical canonical nodes may carry the inner business/sandbox Topic ID,
					// while Tool responses are bucketed by the outer chat Topic ID. Keep the
					// row's Store scope authoritative so paged history resolves toolResponseMap.
					topic_id: topicId || item.node?.topic_id || canonicalNode.topic_id,
				},
			} as VirtualMessageItem)
		: item
	const content = renderNode({ item: effectiveItem })
	if (content == null || content === false) return null

	return (
		<div
			data-message-id={item.key}
			data-message-role={item.role || "user"}
			className={cn(
				"relative w-full",
				!item.isUser && !item.isTool && ASSISTANT_MESSAGE_ROW_CLASS,
				item.isUser && USER_MESSAGE_ROW_CLASS,
			)}
		>
			{content}
		</div>
	)
})

function VirtualMessageListInner({
	topicId,
	items,
	userIndices,
	isMobile,
	getScrollElement,
	renderNode,
	stickyMessageClassName,
	useMobileStickyOverlay = true,
	exportMode,
	selectedKeys,
	onToggleSelect,
	limitReached,
	virtualizerRef,
	onVirtualizerChange,
}: VirtualMessageListProps) {
	const rangeExtractor = useMemo(() => createStickyRangeExtractor(userIndices), [userIndices])
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: items.length,
		getScrollElement,
		getItemKey: (index) => items[index].key,
		estimateSize: (index) => (items[index]?.isUser ? 88 : 128),
		overscan: 6,
		rangeExtractor,
		useAnimationFrameWithResizeObserver: true,
		onChange: onVirtualizerChange,
	})

	if (virtualizerRef) virtualizerRef.current = virtualizer

	const virtualItems = virtualizer.getVirtualItems()
	const visibleStartIndex = virtualizer.range?.startIndex ?? virtualItems[0]?.index ?? 0
	const activeStickyIndex = findActiveStickyIndex(userIndices, visibleStartIndex)
	const activeStickyPosition =
		activeStickyIndex === undefined ? -1 : userIndices.indexOf(activeStickyIndex)
	const nextStickyIndex =
		activeStickyPosition >= 0 ? userIndices[activeStickyPosition + 1] : undefined
	const stickyTopClass = getUserMessageStickyTopClass(isMobile)
	const stickyTop = isMobile ? 0 : 40

	return (
		<div
			data-testid="virtual-message-canvas"
			className="relative w-full"
			style={{ height: `${virtualizer.getTotalSize()}px` }}
		>
			{virtualItems.map((virtualItem) => {
				const item = items[virtualItem.index]
				if (!item) return null

				const isActiveSticky = item.stickyCandidate && activeStickyIndex === item.index
				const nextStickyStart =
					nextStickyIndex === undefined
						? undefined
						: virtualizer.measurementsCache[nextStickyIndex]?.start
				const stickyContentSize = Math.max(0, virtualItem.size - MESSAGE_ROW_SPACING)
				const stickyPushOffset =
					isActiveSticky && nextStickyStart !== undefined
						? Math.min(
								0,
								nextStickyStart -
									(virtualizer.scrollOffset ??
										getScrollElement()?.scrollTop ??
										0) -
									stickyTop -
									stickyContentSize,
							)
						: 0
				const resetKey =
					typeof item.node?.content === "string"
						? item.node.content
						: typeof item.node?.status === "string"
							? item.node.status
							: undefined
				const selected = Boolean(selectedKeys?.has(item.turnKey))
				const selectable = exportMode && item.exportSelectable
				const disabled = selectable && !selected && Boolean(limitReached)

				const wrapMessageRow = (content: ReactNode) => (
					<div
						data-message-id={item.key}
						data-message-role={item.role || "user"}
						className={cn(
							"relative w-full",
							!item.isUser && !item.isTool && ASSISTANT_MESSAGE_ROW_CLASS,
							item.isUser && USER_MESSAGE_ROW_CLASS,
						)}
					>
						{content}
					</div>
				)
				const messageRow = (
					<MessageRenderErrorBoundary
						messageKey={item.key}
						resetKey={resetKey}
						fallbackWrapper={wrapMessageRow}
					>
						<MessageViewStateScopeProvider messageKey={item.key}>
							<VirtualMessageRenderRow
								topicId={topicId}
								item={item}
								renderNode={renderNode}
							/>
						</MessageViewStateScopeProvider>
					</MessageRenderErrorBoundary>
				)

				return (
					<div
						key={item.key}
						ref={virtualizer.measureElement}
						data-index={virtualItem.index}
						data-testid="virtual-message-row"
						data-virtual-message-key={item.key}
						{...(isActiveSticky ? { "data-sticky-message-id": item.key } : {})}
						className={cn(
							"left-0 w-full",
							isActiveSticky
								? cn(
										USER_MESSAGE_STICKY_POSITION_CLASS,
										stickyTopClass,
										isMobile && "z-40",
										stickyMessageClassName,
									)
								: "absolute top-0",
							selectable &&
								"group/export rounded-lg py-1 pl-9 pr-1 transition-colors duration-150",
							selectable && !disabled && "cursor-pointer",
							selectable && !selected && !disabled && "hover:bg-muted/30",
							disabled && "cursor-not-allowed opacity-55",
						)}
						style={{
							position: isActiveSticky ? "sticky" : "absolute",
							transform: `translateY(${isActiveSticky ? stickyPushOffset : virtualItem.start}px)`,
						}}
						onClick={
							selectable
								? () => {
										if (!disabled) onToggleSelect?.(item.turnKey)
									}
								: undefined
						}
					>
						{selectable && item.isUser ? (
							<div className="pointer-events-auto absolute left-0 top-4 z-40 flex size-7 items-center justify-center">
								<Checkbox
									checked={selected}
									disabled={disabled}
									className="size-4"
									onCheckedChange={() => onToggleSelect?.(item.turnKey)}
									onClick={(event) => event.stopPropagation()}
								/>
							</div>
						) : null}
						<div className={cn("min-w-0", selected && "opacity-95")}>
							{item.isUser ? (
								<>
									<div
										className={cn(
											"relative",
											USER_MESSAGE_STICKY_MASK_CLASS,
											isMobile &&
												useMobileStickyOverlay &&
												USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
											stickyMessageClassName,
										)}
									>
										{messageRow}
									</div>
									<div
										aria-hidden
										data-virtual-message-spacing="true"
										className="h-2"
									/>
								</>
							) : (
								messageRow
							)}
						</div>
					</div>
				)
			})}
		</div>
	)
}

export const VirtualMessageList = memo(VirtualMessageListInner)
