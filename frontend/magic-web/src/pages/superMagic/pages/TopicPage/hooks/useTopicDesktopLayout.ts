import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { TopicLayoutStore, type HistoryDragResult } from "../stores/TopicLayoutStore"

interface UseTopicDesktopLayoutOptions {
	isReadOnly: boolean
	allowProjectSiderResize?: boolean
	enableProjectCollapse?: boolean
	onHistoryDragEnd?: (result: HistoryDragResult) => void
	allowConversationPanelResize?: boolean
	/** Controls whether conversation collapse state survives remounts. */
	persistConversationPanelState?: boolean
	/** Initial state used when a page owns a temporary conversation layout. */
	initialConversationPanelCollapsed?: boolean
}

interface UseTopicDesktopLayoutReturn {
	isProjectSiderCollapsed: boolean
	collapseProjectSider: () => void
	expandProjectSider: () => void
	isDraggingHistoryPanel: boolean
	historyDragWidthPx: number
	collapseProgress: number
	isCollapseArmed: boolean
	startDragHistoryPanel: (
		clientX: number,
		width: number,
		preferredWidth: number,
		maxWidth: number,
	) => void
	cancelDrag: () => void
	containerRef: RefObject<HTMLDivElement>
	containerWidthPx: number
	projectSiderWidthPx: number
	messagePanelWidthPx: number
	collapsedMessagePanelWidthPx: number
	isConversationPanelCollapsed: boolean
	isDraggingProjectSider: boolean
	isDraggingMessagePanel: boolean
	startDragProjectSider: (clientX: number) => void
	startDragMessagePanel: (clientX: number, visibleWidth?: number) => void
	toggleConversationPanel: () => void
	expandConversationPanel: () => void
	collapseConversationPanel: () => void
	ensureExpandedWhenDetailVisible: (shouldShowDetailPanel: boolean) => void
}

export function useTopicDesktopLayout({
	isReadOnly,
	allowProjectSiderResize = !isReadOnly,
	persistConversationPanelState = true,
	initialConversationPanelCollapsed = false,
	enableProjectCollapse = false,
	onHistoryDragEnd,
	allowConversationPanelResize = !isReadOnly,
}: UseTopicDesktopLayoutOptions): UseTopicDesktopLayoutReturn {
	const containerRef = useRef<HTMLDivElement>(null)
	const storeRef = useRef<TopicLayoutStore | null>(null)

	if (!storeRef.current) {
		storeRef.current = new TopicLayoutStore({
			persistConversationPanelState,
			initialConversationPanelCollapsed,
			bufferedMessageCollapse: enableProjectCollapse,
			allowConversationPanelResize,
		})
	}
	const store = storeRef.current
	useLayoutEffect(() => {
		store.setConversationPanelResizeAllowed(allowConversationPanelResize)
	}, [store, allowConversationPanelResize])

	const startDragProjectSider = useMemoizedFn((clientX: number) => {
		if (!allowProjectSiderResize) return
		store.startDragProjectSider(clientX, enableProjectCollapse)
	})

	const finishHistoryDrag = useMemoizedFn((result: HistoryDragResult) =>
		onHistoryDragEnd?.(result),
	)

	const startDragMessagePanel = useMemoizedFn((clientX: number, visibleWidth?: number) => {
		if (isReadOnly || !allowConversationPanelResize) return
		store.startDragMessagePanel(clientX, visibleWidth)
	})

	const toggleConversationPanel = useMemoizedFn(() => {
		if (!allowConversationPanelResize && !store.isConversationPanelCollapsed) return
		store.toggleConversationPanel()
	})

	const expandConversationPanel = useMemoizedFn(() => {
		store.expandConversationPanel()
	})

	/** Collapses the conversation panel while preserving its last expanded width. */
	const collapseConversationPanel = useMemoizedFn(() => {
		if (!allowConversationPanelResize) return
		store.collapseConversationPanel()
	})

	const ensureExpandedWhenDetailVisible = useMemoizedFn((shouldShowDetailPanel: boolean) => {
		store.ensureExpandedWhenDetailVisible(shouldShowDetailPanel)
	})

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Expand_Topic_Conversation_Panel, expandConversationPanel)
		pubsub.subscribe(PubSubEvents.Collapse_Topic_Conversation_Panel, collapseConversationPanel)
		return () => {
			pubsub.unsubscribe(
				PubSubEvents.Expand_Topic_Conversation_Panel,
				expandConversationPanel,
			)
			pubsub.unsubscribe(
				PubSubEvents.Collapse_Topic_Conversation_Panel,
				collapseConversationPanel,
			)
		}
	}, [collapseConversationPanel, expandConversationPanel])

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		const updateContainerWidth = () => {
			if (!containerRef.current) return
			if (
				store.containerWidthPx !== containerRef.current.clientWidth &&
				(store.isDraggingHistoryPanel ||
					(enableProjectCollapse &&
						(store.isDraggingProjectSider || store.isDraggingMessagePanel)))
			)
				store.cancelDrag()
			store.setContainerWidth(containerRef.current.clientWidth)
		}

		updateContainerWidth()
		const observer = new ResizeObserver(updateContainerWidth)
		observer.observe(container)

		return () => {
			observer.disconnect()
		}
	}, [store, enableProjectCollapse])

	useEffect(() => {
		if (
			!store.isDraggingProjectSider &&
			!store.isDraggingMessagePanel &&
			!store.isDraggingHistoryPanel
		)
			return

		let rafId: number | null = null
		let nextClientX: number | null = null

		const flushDragPosition = () => {
			rafId = null
			if (nextClientX === null) return
			store.updateDrag(nextClientX)
			nextClientX = null
		}

		/** Queues pointer movement so touch and mouse resizing share the same throttled update path. */
		const handlePointerMove = (event: PointerEvent) => {
			nextClientX = event.clientX
			if (rafId !== null) return
			rafId = window.requestAnimationFrame(flushDragPosition)
		}

		/** Finalizes drag and persists the latest width when the pointer completes normally. */
		const handlePointerUp = (event: PointerEvent) => {
			nextClientX = event.clientX
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
			}
			flushDragPosition()
			const result = store.endDrag()
			if (result) finishHistoryDrag(result)
		}

		/** Cancels drag without persisting widths from a browser-aborted touch gesture. */
		const handlePointerCancel = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
				rafId = null
			}
			nextClientX = null
			store.cancelDrag()
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== "Escape" ||
				(!(
					enableProjectCollapse &&
					(store.isDraggingProjectSider || store.isDraggingMessagePanel)
				) &&
					!store.isDraggingHistoryPanel)
			)
				return
			event.preventDefault()
			event.stopImmediatePropagation()
			handlePointerCancel()
		}
		document.addEventListener("keydown", handleKeyDown, true)
		document.addEventListener("pointermove", handlePointerMove)
		document.addEventListener("pointerup", handlePointerUp)
		document.addEventListener("pointercancel", handlePointerCancel)

		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
			}
			document.removeEventListener("keydown", handleKeyDown, true)
			document.removeEventListener("pointermove", handlePointerMove)
			document.removeEventListener("pointerup", handlePointerUp)
			document.removeEventListener("pointercancel", handlePointerCancel)
		}
	}, [
		store,
		store.isDraggingProjectSider,
		store.isDraggingMessagePanel,
		store.isDraggingHistoryPanel,
		enableProjectCollapse,
		finishHistoryDrag,
	])

	useEffect(() => {
		return () => {
			store.cancelDrag()
		}
	}, [store])

	return {
		isProjectSiderCollapsed: enableProjectCollapse && store.isProjectSiderCollapsed,
		collapseProjectSider: store.collapseProjectSider,
		expandProjectSider: store.expandProjectSider,
		isDraggingHistoryPanel: store.isDraggingHistoryPanel,
		historyDragWidthPx: store.historyDragWidthPx,
		collapseProgress: store.collapseProgress,
		isCollapseArmed: store.isCollapseArmed,
		startDragHistoryPanel: store.startDragHistoryPanel,
		cancelDrag: store.cancelDrag,
		containerRef,
		containerWidthPx: store.containerWidthPx,
		projectSiderWidthPx: store.projectSiderWidthPx,
		messagePanelWidthPx: store.messagePanelWidthPx,
		collapsedMessagePanelWidthPx: store.COLLAPSED_MESSAGE_PANEL_WIDTH,
		isConversationPanelCollapsed: store.isConversationPanelCollapsed,
		isDraggingProjectSider: store.isDraggingProjectSider,
		isDraggingMessagePanel: store.isDraggingMessagePanel,
		startDragProjectSider,
		startDragMessagePanel,
		toggleConversationPanel,
		expandConversationPanel,
		collapseConversationPanel,
		ensureExpandedWhenDetailVisible,
	}
}
