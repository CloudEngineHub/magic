import {
	forwardRef,
	memo,
	type CSSProperties,
	type MutableRefObject,
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react"
import { GroupedVirtuoso, type GroupProps, type ListRange } from "react-virtuoso"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/utils/cn"
import { superMagicStore } from "@/pages/superMagic/stores"
import { observer } from "mobx-react-lite"
import MessageRenderErrorBoundary from "./MessageRenderErrorBoundary"
import {
	ASSISTANT_MESSAGE_ROW_CLASS,
	USER_MESSAGE_ROW_CLASS,
	USER_MESSAGE_STICKY_MASK_CLASS,
	USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
} from "../MessageTurnGroupList"
import {
	buildGroupedVirtualMessageProjection,
	getPrependedVirtualItemCount,
	type VirtualMessageItem,
} from "../virtual-message-items"
import type { MessageListScrollAdapter } from "../message-list-scroll-adapter"
import { MessageViewStateScopeProvider } from "../view-state/MessageViewStateContext"

const terminalToolStatuses = new Set(["completed", "failed", "error", "finished", "suspended"])
const INITIAL_FIRST_ITEM_INDEX = 1_000_000

function hasTerminalToolStatus(node: Record<string, unknown> | undefined) {
	if (!node) return false
	const debug = node.debug as Record<string, unknown> | undefined
	const tool = node.tool as Record<string, unknown> | undefined
	const debugTool = debug?.tool as Record<string, unknown> | undefined
	return [node.status, debug?.status, tool?.status, debugTool?.status].some(
		(status) =>
			typeof status === "string" &&
			(terminalToolStatuses.has(status) || status === "response_missing"),
	)
}

export interface VirtualMessageListProps {
	topicId?: string
	items: Array<VirtualMessageItem>
	/** Kept optional for call-site compatibility; GroupedVirtuoso derives groups from items. */
	userIndices?: Array<number>
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
	virtualizerRef?: MutableRefObject<MessageListScrollAdapter | null>
	onVirtualizerChange?: (instance: MessageListScrollAdapter, sync: boolean) => void
}

const VirtuosoGroup = ({ children, style, ...props }: GroupProps) => (
	<div
		data-component="group"
		{...props}
		className="sticky z-20"
		style={{
			...style,
			top: "var(--message-group-sticky-top, 0px)",
		}}
	>
		{children}
	</div>
)

const VirtuosoList = forwardRef<HTMLDivElement, { children?: ReactNode; style?: CSSProperties }>(
	({ children, style, ...props }, ref) => (
		<div ref={ref} {...props} style={{ ...style, width: "100%" }} data-component="item">
			{children}
		</div>
	),
)

const VIRTUOSO_COMPONENTS = { Group: VirtuosoGroup, List: VirtuosoList }

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
				| Record<string, unknown>
				| undefined)
		: undefined
	if (item.isTool && !hasTerminalToolStatus(canonicalNode) && !hasTerminalToolStatus(item.node)) {
		// Keep a measured zero-height placeholder while a streaming Tool has no visible body.
		// This lets Virtuoso observe the transition to a terminal Tool without a phantom gap.
		return (
			<div
				data-virtual-message-hidden="true"
				aria-hidden
				className="h-px w-full overflow-hidden"
				style={{ height: 1, minHeight: 1 }}
			/>
		)
	}
	const effectiveItem = canonicalNode
		? ({
				...item,
				node: {
					...item.node,
					...canonicalNode,
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

function getResetKey(item: VirtualMessageItem) {
	return typeof item.node?.content === "string"
		? item.node.content
		: typeof item.node?.status === "string"
			? item.node.status
			: undefined
}

function VirtualMessageContent({
	item,
	topicId,
	renderNode,
}: {
	item: VirtualMessageItem
	topicId?: string
	renderNode: VirtualMessageListProps["renderNode"]
}) {
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

	return (
		<MessageRenderErrorBoundary
			messageKey={item.key}
			resetKey={getResetKey(item)}
			fallbackWrapper={wrapMessageRow}
		>
			<MessageViewStateScopeProvider messageKey={item.key}>
				<VirtualMessageRenderRow topicId={topicId} item={item} renderNode={renderNode} />
			</MessageViewStateScopeProvider>
		</MessageRenderErrorBoundary>
	)
}

function VirtualMessageRow({
	item,
	topicId,
	renderNode,
	isGroupHeader,
	stickyMessageClassName,
	useMobileStickyOverlay,
	exportMode,
	selectedKeys,
	onToggleSelect,
	limitReached,
	setItemElement,
}: {
	item: VirtualMessageItem
	topicId?: string
	renderNode: VirtualMessageListProps["renderNode"]
	isGroupHeader: boolean
	stickyMessageClassName?: string
	useMobileStickyOverlay: boolean
	exportMode?: boolean
	selectedKeys?: ReadonlySet<string>
	onToggleSelect?: (key: string) => void
	limitReached?: boolean
	setItemElement: (key: string, element: HTMLElement | null) => void
}) {
	const selected = Boolean(selectedKeys?.has(item.turnKey))
	const selectable = exportMode && item.exportSelectable
	const disabled = selectable && !selected && Boolean(limitReached)

	return (
		<div
			ref={(element) => setItemElement(item.key, element)}
			data-testid="virtual-message-row"
			data-virtual-message-key={item.key}
			data-virtual-message-kind={isGroupHeader ? "group" : "item"}
			// Virtuoso cannot measure a zero-height child. Keep dynamic sidecar rows measurable
			// while their Store-backed content is still resolving, then let real content expand it.
			style={{ minHeight: 1 }}
			className={cn(
				"relative w-full",
				selectable &&
					"group/export rounded-lg py-1 pl-9 pr-1 transition-colors duration-150",
				selectable && !disabled && "cursor-pointer",
				selectable && !selected && !disabled && "hover:bg-muted/30",
				disabled && "cursor-not-allowed opacity-55",
			)}
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
				{isGroupHeader ? (
					<>
						<div
							className={cn(
								"relative",
								USER_MESSAGE_STICKY_MASK_CLASS,
								useMobileStickyOverlay && USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
								stickyMessageClassName,
							)}
						>
							<VirtualMessageContent
								item={item}
								topicId={topicId}
								renderNode={renderNode}
							/>
						</div>
						<div aria-hidden data-virtual-message-spacing="true" className="h-2" />
					</>
				) : (
					<VirtualMessageContent item={item} topicId={topicId} renderNode={renderNode} />
				)}
			</div>
		</div>
	)
}

function VirtualMessageListInner({
	topicId,
	items,
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
	const groupedProjection = useMemo(() => buildGroupedVirtualMessageProjection(items), [items])
	const groupedVirtualSequenceKeys = useMemo(
		() =>
			groupedProjection.groups.flatMap((group) => [
				`group-header-${group.key}`,
				...group.items.map((item) => item.key),
			]),
		[groupedProjection.groups],
	)
	const rangeRef = useRef<ListRange | undefined>(undefined)
	const totalSizeRef = useRef(0)
	const itemElementsRef = useRef(new Map<string, HTMLElement>())
	const firstItemIndexRef = useRef(INITIAL_FIRST_ITEM_INDEX)
	const previousTopicIdRef = useRef(topicId)
	const previousVirtualItemsRef = useRef<Array<Pick<VirtualMessageItem, "key">>>([])
	const processedSequenceRef = useRef("")
	const viewport = getScrollElement()

	if (previousTopicIdRef.current !== topicId) {
		previousTopicIdRef.current = topicId
		firstItemIndexRef.current = INITIAL_FIRST_ITEM_INDEX
		previousVirtualItemsRef.current = []
		processedSequenceRef.current = ""
	}

	const virtualSequenceSignature = groupedProjection.items.map((item) => item.key).join("\u0000")
	if (processedSequenceRef.current !== virtualSequenceSignature) {
		// Virtuoso must receive the new data and the matching firstItemIndex in the same render;
		// waiting for an effect would allow one paint at the old scroll coordinate. The signature
		// makes this render-phase bookkeeping idempotent across repeated React renders.
		const prependedCount = getPrependedVirtualItemCount(
			previousVirtualItemsRef.current,
			groupedProjection.items,
		)
		if (prependedCount > 0) {
			firstItemIndexRef.current = Math.max(1, firstItemIndexRef.current - prependedCount)
		}
		previousVirtualItemsRef.current = groupedProjection.items
		processedSequenceRef.current = virtualSequenceSignature
	}

	const setItemElement = useCallback((key: string, element: HTMLElement | null) => {
		if (element) itemElementsRef.current.set(key, element)
		else itemElementsRef.current.delete(key)
	}, [])

	const getItemOffset = useCallback(
		(key: string) => {
			const element = itemElementsRef.current.get(key)
			const currentViewport = getScrollElement()
			if (!element || !currentViewport) return undefined
			const rect = element.getBoundingClientRect()
			const viewportRect = currentViewport.getBoundingClientRect()
			return rect.top - viewportRect.top + currentViewport.scrollTop
		},
		[getScrollElement],
	)

	const getFirstVisibleItemKey = useCallback(() => {
		const currentViewport = getScrollElement()
		if (!currentViewport) return undefined
		const viewportTop = currentViewport.getBoundingClientRect().top
		const viewportBottom = viewportTop + currentViewport.clientHeight
		const visibleItems: Array<{ key: string; top: number }> = []
		const visibleGroups: Array<{ key: string; top: number }> = []
		for (const [key, element] of itemElementsRef.current) {
			const rect = element.getBoundingClientRect()
			if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) continue
			if (rect.bottom <= viewportTop || rect.top >= viewportBottom) continue
			if (element.dataset.virtualMessageKind === "group") {
				visibleGroups.push({ key, top: rect.top })
				continue
			}
			visibleItems.push({ key, top: rect.top })
		}
		visibleItems.sort((left, right) => left.top - right.top)
		if (visibleItems[0]) return visibleItems[0].key
		visibleGroups.sort((left, right) => left.top - right.top)
		return visibleGroups[0]?.key
	}, [getScrollElement])

	const scrollToOffset = useCallback(
		(offset: number, options?: { align?: "start" | "end"; behavior?: ScrollBehavior }) => {
			const currentViewport = getScrollElement()
			if (!currentViewport) return
			const top = options?.align === "end" ? offset - currentViewport.clientHeight : offset
			currentViewport.scrollTo({
				top: Math.max(0, top),
				behavior: options?.behavior || "auto",
			})
		},
		[getScrollElement],
	)

	const adapter = useMemo<MessageListScrollAdapter>(
		() => ({
			range: rangeRef.current,
			getTotalSize: () => totalSizeRef.current,
			getFirstVisibleItemKey,
			getItemOffset,
			scrollToOffset,
		}),
		[getFirstVisibleItemKey, getItemOffset, scrollToOffset],
	)

	useLayoutEffect(() => {
		if (virtualizerRef) virtualizerRef.current = adapter
		return () => {
			if (virtualizerRef?.current === adapter) virtualizerRef.current = null
		}
	}, [adapter, virtualizerRef])

	const notifyVirtualizerChange = useCallback(() => {
		onVirtualizerChange?.(adapter, false)
	}, [adapter, onVirtualizerChange])
	const handleRangeChanged = useCallback((range: ListRange) => {
		rangeRef.current = range
	}, [])
	const handleTotalListHeightChanged = useCallback(
		(height: number) => {
			totalSizeRef.current = height
			notifyVirtualizerChange()
		},
		[notifyVirtualizerChange],
	)

	const listStyle = useMemo(
		() =>
			({
				"--message-group-sticky-top": isMobile ? "0px" : "40px",
				width: "100%",
			}) as CSSProperties,
		[isMobile],
	)

	const computeVirtualMessageItemKey = useCallback(
		(index: number) => {
			// GroupedVirtuoso's key index includes firstItemIndex and group headers. Resolve
			// against the physical grouped sequence so prepend updates keep each DOM node
			// associated with the same message or header.
			const localPhysicalIndex = index - firstItemIndexRef.current
			return groupedVirtualSequenceKeys[localPhysicalIndex] || `virtual-message-${index}`
		},
		[groupedVirtualSequenceKeys],
	)

	const renderGroupContent = useCallback(
		(groupIndex: number) => {
			const header = groupedProjection.groups[groupIndex]?.header
			if (!header) {
				// GroupedVirtuoso still mounts a Group wrapper for leading non-User messages;
				// a 1px spacer avoids its zero-sized-element warning without adding visible UI.
				return (
					<div
						aria-hidden
						data-virtual-message-leading-group-spacer="true"
						style={{ height: 1, minHeight: 1 }}
					/>
				)
			}
			return (
				<VirtualMessageRow
					item={header}
					topicId={topicId}
					renderNode={renderNode}
					isGroupHeader
					stickyMessageClassName={stickyMessageClassName}
					useMobileStickyOverlay={isMobile && useMobileStickyOverlay}
					exportMode={exportMode}
					selectedKeys={selectedKeys}
					onToggleSelect={onToggleSelect}
					limitReached={limitReached}
					setItemElement={setItemElement}
				/>
			)
		},
		[
			exportMode,
			groupedProjection.groups,
			isMobile,
			limitReached,
			onToggleSelect,
			renderNode,
			selectedKeys,
			setItemElement,
			stickyMessageClassName,
			topicId,
			useMobileStickyOverlay,
		],
	)

	const renderItemContent = useCallback(
		(index: number, _groupIndex: number) => {
			// itemContent's index includes firstItemIndex but excludes group headers. Resolve
			// it against the flattened ordinary-item projection used by the official pattern.
			const item = groupedProjection.items[index - firstItemIndexRef.current]
			if (!item) return null
			return (
				<VirtualMessageRow
					item={item}
					topicId={topicId}
					renderNode={renderNode}
					isGroupHeader={false}
					stickyMessageClassName={stickyMessageClassName}
					useMobileStickyOverlay={isMobile && useMobileStickyOverlay}
					exportMode={exportMode}
					selectedKeys={selectedKeys}
					onToggleSelect={onToggleSelect}
					limitReached={limitReached}
					setItemElement={setItemElement}
				/>
			)
		},
		[
			exportMode,
			groupedProjection.items,
			isMobile,
			limitReached,
			onToggleSelect,
			renderNode,
			selectedKeys,
			setItemElement,
			stickyMessageClassName,
			topicId,
			useMobileStickyOverlay,
		],
	)

	return (
		<div data-testid="virtual-message-canvas" className="relative w-full">
			<GroupedVirtuoso
				groupCounts={groupedProjection.groupCounts}
				firstItemIndex={firstItemIndexRef.current}
				customScrollParent={viewport ?? undefined}
				computeItemKey={computeVirtualMessageItemKey}
				defaultItemHeight={128}
				increaseViewportBy={{ top: 160, bottom: 240 }}
				overscan={{ main: 240, reverse: 240 }}
				skipAnimationFrameInResizeObserver
				style={listStyle}
				components={VIRTUOSO_COMPONENTS}
				rangeChanged={handleRangeChanged}
				totalListHeightChanged={handleTotalListHeightChanged}
				groupContent={renderGroupContent}
				itemContent={renderItemContent}
			/>
		</div>
	)
}

export const VirtualMessageList = memo(VirtualMessageListInner)
