import {
	createContext,
	forwardRef,
	memo,
	type MutableRefObject,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { Virtualizer, type CustomItemComponentProps, type VirtualizerHandle } from "virtua"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/utils/cn"
import { superMagicStore } from "@/pages/superMagic/stores"
import { observer } from "mobx-react-lite"
import MessageRenderErrorBoundary from "./MessageRenderErrorBoundary"
import {
	ASSISTANT_MESSAGE_ROW_CLASS,
	getStickyMessageTopOffset,
	USER_MESSAGE_ROW_CLASS,
	USER_MESSAGE_STICKY_MASK_CLASS,
	USER_MESSAGE_STICKY_OVERLAY_CLASS_MOBILE,
} from "../sticky-message-classes"
import {
	findActiveStickyIndex,
	findNextStickyIndex,
	getPrependedVirtualItemCount,
	type VirtualMessageItem,
} from "../virtual-message-items"
import type { MessageListScrollAdapter } from "../message-list-scroll-adapter"
import { MessageViewStateScopeProvider } from "../view-state/MessageViewStateContext"
import { useMemoizedFn } from "ahooks"

const terminalToolStatuses = new Set(["completed", "failed", "error", "finished", "suspended"])
const FOOTER_ROW_KEY = "__message-list-footer__"
const STICKY_TOP_CSS_VARIABLE = "--message-group-sticky-top"
const NO_STICKY_INDEX = -1
/** Let Virtua finish a burst of initial measurements before recomputing sticky ownership. */
const STICKY_MEASUREMENT_SETTLE_MS = 100

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
	/** Bottom content is the last virtual row so its height is measured by the same virtualizer. */
	footer?: ReactNode
	/** Indices of User rows in `items`; drives which row is pinned while scrolling. */
	userIndices?: Array<number>
	isMobile: boolean
	getScrollElement: () => HTMLDivElement | null
	/** Height of whatever the caller renders between the scroll container and this list. */
	startMargin?: number
	/**
	 * Distance from the viewport top at which the pinned User turn parks. Defaults to the
	 * workspace's header line, so a shell that has no such header must state its own — before
	 * virtualization this was the caller's `top-*` class on the sticky row itself.
	 */
	stickyTopOffset?: number
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
	/** Allow canvas measurement changes to trigger sticky recomputation for streaming content. */
	allowResizeStickySync?: boolean
}

const StickyIndexContext = createContext(NO_STICKY_INDEX)

/**
 * virtua positions every row absolutely, which makes native `position: sticky` a no-op. The
 * pinned User row is switched back into flow so it becomes the container's only in-flow child:
 * its static position lands at the container top, and `top` then parks it against the viewport.
 *
 * It has to be native sticky. Writing the row's offset from the scroll handler instead puts the
 * pin a frame behind a scroll the compositor has already painted, which reads as the row shaking
 * against the viewport for as long as it is held. A row is only ever pinned from a static
 * position at or above the park line, so sticky always resolves it to exactly `top`.
 */
const MessageVirtualItem = forwardRef<HTMLDivElement, CustomItemComponentProps>(
	function MessageVirtualItem({ children, style, index }, ref) {
		const activeStickyIndex = useContext(StickyIndexContext)
		const isSticky = index === activeStickyIndex

		return (
			<div
				ref={ref}
				data-virtual-item-index={index}
				data-virtual-item-sticky={isSticky ? "true" : undefined}
				style={
					isSticky
						? {
								...style,
								position: "sticky",
								top: `var(${STICKY_TOP_CSS_VARIABLE}, 0px)`,
								zIndex: 20,
							}
						: style
				}
			>
				{children}
			</div>
		)
	},
)

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
		// This lets the virtualizer observe the transition to a terminal Tool without a phantom gap.
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
	stickyMessageClassName,
	useMobileStickyOverlay,
	exportMode,
	selectedKeys,
	onToggleSelect,
	limitReached,
}: {
	item: VirtualMessageItem
	topicId?: string
	renderNode: VirtualMessageListProps["renderNode"]
	stickyMessageClassName?: string
	useMobileStickyOverlay: boolean
	exportMode?: boolean
	selectedKeys?: ReadonlySet<string>
	onToggleSelect?: (key: string) => void
	limitReached?: boolean
}) {
	const selected = Boolean(selectedKeys?.has(item.turnKey))
	const selectable = exportMode && item.exportSelectable
	const disabled = selectable && !selected && Boolean(limitReached)

	return (
		<div
			data-testid="virtual-message-row"
			data-virtual-message-key={item.key}
			data-virtual-message-kind={item.isUser ? "group" : "item"}
			// A zero-height child cannot be measured reliably. Keep dynamic sidecar rows
			// measurable while their Store-backed content resolves, then let content expand it.
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
				{item.isUser ? (
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

const EMPTY_USER_INDICES: Array<number> = []

function VirtualMessageListInner({
	topicId,
	items,
	footer = null,
	userIndices = EMPTY_USER_INDICES,
	isMobile,
	getScrollElement,
	startMargin = 0,
	stickyTopOffset: stickyTopOffsetProp,
	renderNode,
	stickyMessageClassName,
	useMobileStickyOverlay = true,
	exportMode,
	selectedKeys,
	onToggleSelect,
	limitReached,
	virtualizerRef,
	onVirtualizerChange,
	allowResizeStickySync = true,
}: VirtualMessageListProps) {
	const handleRef = useRef<VirtualizerHandle | null>(null)
	const canvasRef = useRef<HTMLDivElement | null>(null)
	const scrollRef = useRef<HTMLElement | null>(null)
	const previousTopicIdRef = useRef(topicId)
	const previousItemsRef = useRef<Array<Pick<VirtualMessageItem, "key">>>([])
	const processedSequenceRef = useRef("")
	const shiftRef = useRef(false)
	const stickyTopValueRef = useRef<number | null>(null)
	const stickySyncFrameRef = useRef<number | null>(null)
	const stickySyncPendingRef = useRef(false)
	const stickySyncDebounceRef = useRef<number | null>(null)
	const stickySyncGenerationRef = useRef(0)
	const stickyMeasurementSettlingRef = useRef(false)
	const stickyInitialMeasurementSettledRef = useRef(false)
	const stickyLastScrollOffsetRef = useRef<number | null>(null)
	const lastStickySequenceSignatureRef = useRef<string | null>(null)
	const [activeStickyIndex, setActiveStickyIndex] = useState(NO_STICKY_INDEX)

	const stickyTopOffset = stickyTopOffsetProp ?? getStickyMessageTopOffset(isMobile)
	// Callers may hand over a plain ref that is only populated once their own scroll element
	// commits, which happens after this subtree. Re-read it every commit so the virtualizer
	// mounts on the very next render instead of silently rendering nothing.
	const [viewport, setViewport] = useState<HTMLElement | null>(() => getScrollElement())
	// Runs on every commit by design; the functional update bails out when the element is
	// unchanged, so this cannot loop.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useLayoutEffect(() => {
		setViewport((previous) => {
			const next = getScrollElement()
			return previous === next ? previous : next
		})
	})
	if (scrollRef.current !== viewport) scrollRef.current = viewport

	const rowCount = items.length + (footer ? 1 : 0)
	const rowCountRef = useRef(rowCount)
	rowCountRef.current = rowCount
	const userIndicesRef = useRef(userIndices)
	userIndicesRef.current = userIndices
	const startMarginRef = useRef(startMargin)
	startMarginRef.current = startMargin

	if (previousTopicIdRef.current !== topicId) {
		previousTopicIdRef.current = topicId
		previousItemsRef.current = []
		processedSequenceRef.current = ""
		shiftRef.current = false
		stickyTopValueRef.current = null
		stickyMeasurementSettlingRef.current = false
		stickyInitialMeasurementSettledRef.current = false
		stickyLastScrollOffsetRef.current = null
		lastStickySequenceSignatureRef.current = null
	}

	const sequenceSignature = items.map((item) => item.key).join("\u0000")
	if (processedSequenceRef.current !== sequenceSignature) {
		// virtua reads `shift` in the same render that observes the new item count, so this must
		// be render-phase bookkeeping — an effect would allow one paint at the old coordinate.
		// `shift` is only safe for pure prepends; a mid-list change would misplace rows instead.
		shiftRef.current = getPrependedVirtualItemCount(previousItemsRef.current, items) > 0
		previousItemsRef.current = items
		processedSequenceRef.current = sequenceSignature
	}

	useLayoutEffect(() => {
		shiftRef.current = false
	})

	/**
	 * `startMargin` tells virtua about the space before the list, but nothing describes the space
	 * after it, and the caller renders its message column's bottom padding there — inside the same
	 * scroll element, outside virtua's projected size. Aligning the last row's bottom to the
	 * viewport bottom therefore stops short of the real scroll end by exactly that strip.
	 * Measuring the scroll element keeps the caller's padding from having to be restated here.
	 *
	 * `handle.scrollSize` cannot serve this: virtua reports its own projected total size, which
	 * equals `projectedSize` by construction, so the difference would always collapse to zero.
	 */
	const getTrailingSpace = useCallback(() => {
		const handle = handleRef.current
		const viewport = scrollRef.current
		const lastIndex = rowCountRef.current - 1
		if (!handle || !viewport || lastIndex < 0) return 0
		const projectedSize = handle.getItemOffset(lastIndex) + handle.getItemSize(lastIndex)
		return Math.max(0, viewport.scrollHeight - startMarginRef.current - projectedSize)
	}, [])

	const adapter = useMemo<MessageListScrollAdapter>(
		() => ({
			get itemCount() {
				// Rows only become addressable once the virtualizer is behind them; reporting
				// them earlier would let the controller guard a write that goes nowhere.
				return handleRef.current ? rowCountRef.current : 0
			},
			get scrollOffset() {
				return handleRef.current?.scrollOffset ?? 0
			},
			get scrollSize() {
				return handleRef.current?.scrollSize ?? 0
			},
			get viewportSize() {
				return handleRef.current?.viewportSize ?? 0
			},
			findItemIndex: (offset) => handleRef.current?.findItemIndex(offset) ?? 0,
			getItemOffset: (index) => handleRef.current?.getItemOffset(index) ?? 0,
			getItemSize: (index) => handleRef.current?.getItemSize(index) ?? 0,
			scrollTo: (offset) => handleRef.current?.scrollTo(offset),
			scrollToIndex: (index, options) => {
				// Only a bottom-aligned write on the final row is asking for the scroll end; any
				// other row wants its own bottom on the viewport line, untouched.
				const targetsScrollEnd =
					options?.align === "end" && index === rowCountRef.current - 1
				handleRef.current?.scrollToIndex(
					index,
					targetsScrollEnd ? { ...options, offset: getTrailingSpace() } : options,
				)
			},
		}),
		[getTrailingSpace],
	)

	useLayoutEffect(() => {
		if (virtualizerRef) virtualizerRef.current = adapter
		return () => {
			if (virtualizerRef?.current === adapter) virtualizerRef.current = null
		}
	}, [adapter, virtualizerRef])

	/**
	 * Absolutely positioned rows lose the push-out that stacked native sticky headers get for
	 * free. Recreate it by parking the pinned row at `stickyTopOffset` until the next User row
	 * reaches that line, then translating it up in lockstep so the handoff is seamless.
	 *
	 * A pinned row may only ever leave the park line on its way out under the next one. Holding
	 * it anywhere above that line while it is meant to be read puts it in the shell's header,
	 * so the boundary between pinned and released has to stay where the two positions coincide:
	 * the row's own natural slot on the park line.
	 */
	const runStickySync = useMemoizedFn(() => {
		const handle = handleRef.current
		const canvas = canvasRef.current
		if (!handle || !canvas) return

		const scrollOffset = handle.scrollOffset
		stickyLastScrollOffsetRef.current = scrollOffset
		// Probing at the park line (not the viewport top) makes a row take over exactly when it
		// would otherwise scroll above that line, which is where native sticky would clamp it.
		const startIndex = handle.findItemIndex(scrollOffset + stickyTopOffset)
		const nextActive = findActiveStickyIndex(userIndicesRef.current, startIndex)
		let activeIndex = nextActive === undefined ? NO_STICKY_INDEX : nextActive

		/**
		 * Row 0 sits at offset 0 by construction, so any other value means virtua is positioning
		 * from a shifted origin — what it does with a row that grows during a smooth scroll, and
		 * does not always undo. Every row is displaced by the same amount then, which is survivable
		 * on its own; holding one of them back against a park line the others do not share is not,
		 * because it is the one carrying an opaque mask at `z-20`.
		 */
		if (handle.getItemOffset(0) !== 0) activeIndex = NO_STICKY_INDEX

		let top = stickyTopOffset
		if (activeIndex !== NO_STICKY_INDEX) {
			// getItemOffset is relative to the virtualizer container, scrollOffset to the
			// scroll element; startMargin is the gap between the two origins.
			const activeTop =
				handle.getItemOffset(activeIndex) + startMarginRef.current - scrollOffset
			const activeHeight = handle.getItemSize(activeIndex)
			const followerIndex = findNextStickyIndex(userIndicesRef.current, activeIndex)
			if (followerIndex !== undefined) {
				const followerTop =
					handle.getItemOffset(followerIndex) + startMarginRef.current - scrollOffset
				if (followerTop < stickyTopOffset + activeHeight) {
					top = followerTop - activeHeight
				}
			}

			/**
			 * `findItemIndex` clamps a negative probe to row 0, so a list that opens with a User
			 * row always reports that row as parked, scrolled or not. Pinning is not free in that
			 * state: it lifts the row to `z-20`, and its opaque mask then paints over the top of
			 * the reply instead of being covered by it. A pin is only real when it holds the row
			 * away from where the scroll position would otherwise leave it — which also rules it
			 * out for a viewport that cannot scroll at all, and for two User rows with nothing
			 * between them, where the push-out already cancels the park exactly.
			 */
			if (activeTop >= top) activeIndex = NO_STICKY_INDEX
		}

		if (stickyTopValueRef.current !== top) {
			stickyTopValueRef.current = top
			canvas.style.setProperty(STICKY_TOP_CSS_VARIABLE, `${top}px`)
		}
		setActiveStickyIndex((previous) => (previous === activeIndex ? previous : activeIndex))
	})

	const scheduleStickySettle = useMemoizedFn(() => {
		if (stickySyncDebounceRef.current !== null) {
			window.clearTimeout(stickySyncDebounceRef.current)
		}
		const generation = ++stickySyncGenerationRef.current
		stickySyncDebounceRef.current = window.setTimeout(() => {
			stickySyncDebounceRef.current = null
			if (generation !== stickySyncGenerationRef.current) return

			// Virtua may emit scroll and resize callbacks on successive measurement frames while the
			// initial canvas is settling. End that quiet window first; only one pending calculation is
			// allowed to run after the burst, so initialization cannot become a frame-by-frame loop.
			if (stickyMeasurementSettlingRef.current) {
				stickyInitialMeasurementSettledRef.current = true
			}
			stickyMeasurementSettlingRef.current = false
			if (stickySyncFrameRef.current !== null || !stickySyncPendingRef.current) return
			stickySyncPendingRef.current = false
			runStickySync()
		}, STICKY_MEASUREMENT_SETTLE_MS)
	})

	/**
	 * Keep the first request synchronous so scroll/layout callers see the existing sticky
	 * response immediately. Once that leading pass has scheduled a frame, all other callers share
	 * one pending follow-up; this prevents ResizeObserver and Virtua callbacks from creating a
	 * trailing throttle loop while measurements settle. The latest geometry is read at frame time.
	 */
	const syncSticky = useMemoizedFn(() => {
		if (stickyMeasurementSettlingRef.current) {
			// Once a ResizeObserver burst starts, Virtua may emit scroll callbacks for every
			// measurement frame. Keep those callbacks pending until the burst is quiet instead of
			// turning each frame into another synchronous geometry read.
			stickySyncPendingRef.current = true
			scheduleStickySettle()
			return
		}

		// An explicit scroll supersedes a delayed measurement request; keeping both would make the
		// same geometry run once immediately and once again after the settle window.
		if (stickySyncDebounceRef.current !== null) {
			window.clearTimeout(stickySyncDebounceRef.current)
			stickySyncDebounceRef.current = null
			stickySyncGenerationRef.current += 1
		}
		stickySyncPendingRef.current = false
		if (stickySyncFrameRef.current !== null) {
			stickySyncPendingRef.current = true
			return
		}

		runStickySync()
		if (typeof requestAnimationFrame !== "function") return
		stickySyncFrameRef.current = requestAnimationFrame(() => {
			stickySyncFrameRef.current = null
			// A measurement request can arm the settle timer while this frame is pending. Once the
			// frame consumes that request, cancel the timer so it cannot replay the same geometry.
			if (!stickyMeasurementSettlingRef.current && stickySyncDebounceRef.current !== null) {
				window.clearTimeout(stickySyncDebounceRef.current)
				stickySyncDebounceRef.current = null
				stickySyncGenerationRef.current += 1
			}
			if (!stickySyncPendingRef.current) return
			stickySyncPendingRef.current = false
			runStickySync()
		})
	})

	/**
	 * ResizeObserver callbacks describe a measurement burst, not a user gesture. Debouncing this
	 * path keeps Virtua's projected height from feeding one sticky calculation per settling frame;
	 * the final request is still handed through the pending-frame gate when a scroll frame exists.
	 */
	const scheduleStickySync = useMemoizedFn(() => {
		// Only the first canvas measurement burst gates same-offset scroll callbacks. Later
		// resizes still debounce their own geometry work but must not delay user scrolling.
		if (!stickyInitialMeasurementSettledRef.current) {
			stickyMeasurementSettlingRef.current = true
		}
		stickySyncPendingRef.current = true
		scheduleStickySettle()
	})

	useEffect(() => {
		return () => {
			if (stickySyncFrameRef.current !== null) {
				cancelAnimationFrame(stickySyncFrameRef.current)
				stickySyncFrameRef.current = null
			}
			if (stickySyncDebounceRef.current !== null) {
				window.clearTimeout(stickySyncDebounceRef.current)
				stickySyncDebounceRef.current = null
			}
			stickySyncGenerationRef.current += 1
			stickySyncPendingRef.current = false
		}
	}, [syncSticky, scheduleStickySettle])

	const handleScroll = useCallback(
		(nextOffset?: number) => {
			if (stickyMeasurementSettlingRef.current) {
				const scrollOffset = nextOffset ?? handleRef.current?.scrollOffset ?? 0
				if (scrollOffset === stickyLastScrollOffsetRef.current) {
					// A repeated offset during a measurement burst is Virtua initialization noise. Keep
					// it inside the settle window; a real user scroll to a new offset still gets the
					// normal leading sync below.
					stickySyncPendingRef.current = true
					scheduleStickySettle()
					return
				}
				stickyMeasurementSettlingRef.current = false
				stickyInitialMeasurementSettledRef.current = true
				if (stickySyncDebounceRef.current !== null) {
					window.clearTimeout(stickySyncDebounceRef.current)
					stickySyncDebounceRef.current = null
					stickySyncGenerationRef.current += 1
				}
				stickySyncPendingRef.current = false
			}
			syncSticky()
		},
		[scheduleStickySettle, syncSticky],
	)

	const notifyVirtualizerChange = useCallback(() => {
		onVirtualizerChange?.(adapter, false)
	}, [adapter, onVirtualizerChange])

	// The canvas wraps the virtualizer container, whose height is the projected total size.
	// Streaming growth, late measurement and the footer all surface through this one signal.
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas || typeof ResizeObserver === "undefined") return undefined
		const observer = new ResizeObserver(() => {
			if (allowResizeStickySync) scheduleStickySync()
			notifyVirtualizerChange()
		})
		observer.observe(canvas)
		return () => observer.disconnect()
	}, [allowResizeStickySync, notifyVirtualizerChange, scheduleStickySync])

	useLayoutEffect(() => {
		if (lastStickySequenceSignatureRef.current === sequenceSignature) return
		lastStickySequenceSignatureRef.current = sequenceSignature
		syncSticky()
	}, [sequenceSignature, syncSticky])

	/**
	 * virtua clamps its own render range to the item count but takes `keepMounted` verbatim, so an
	 * index left over from a longer list resolves to no child and throws while rendering. The
	 * pinned index is state driven by scroll and measurement, so it always trails a render that
	 * shortens the list — replaying a shared topic restarts it from empty.
	 */
	const keepMounted = useMemo(
		() =>
			activeStickyIndex === NO_STICKY_INDEX || activeStickyIndex >= rowCount
				? undefined
				: [activeStickyIndex],
		[activeStickyIndex, rowCount],
	)

	const rows = useMemo(() => {
		const nodes: Array<ReactNode> = items.map((item) => (
			<VirtualMessageRow
				key={item.key}
				item={item}
				topicId={topicId}
				renderNode={renderNode}
				stickyMessageClassName={stickyMessageClassName}
				useMobileStickyOverlay={isMobile && useMobileStickyOverlay}
				exportMode={exportMode}
				selectedKeys={selectedKeys}
				onToggleSelect={onToggleSelect}
				limitReached={limitReached}
			/>
		))
		if (footer) {
			nodes.push(
				<div
					key={FOOTER_ROW_KEY}
					data-testid="virtual-message-footer"
					style={{ minHeight: 1 }}
				>
					{footer}
				</div>,
			)
		}
		return nodes
	}, [
		exportMode,
		footer,
		isMobile,
		items,
		limitReached,
		onToggleSelect,
		renderNode,
		selectedKeys,
		stickyMessageClassName,
		topicId,
		useMobileStickyOverlay,
	])

	return (
		<div ref={canvasRef} data-testid="virtual-message-canvas" className="relative w-full" style={{height: "100px"}}>
			{viewport ? (
				<StickyIndexContext.Provider value={activeStickyIndex}>
					<Virtualizer
						ref={handleRef}
						scrollRef={scrollRef}
						startMargin={startMargin}
						shift={shiftRef.current}
						bufferSize={400}
						keepMounted={keepMounted}
						item={MessageVirtualItem}
						onScroll={handleScroll}
					>
						{rows}
					</Virtualizer>
				</StickyIndexContext.Provider>
			) : null}
		</div>
	)
}

export const VirtualMessageList = memo(VirtualMessageListInner)
