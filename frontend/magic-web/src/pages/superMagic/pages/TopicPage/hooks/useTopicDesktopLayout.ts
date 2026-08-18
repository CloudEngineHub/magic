import { useEffect, useRef, type RefObject } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { TopicLayoutStore } from "../stores/TopicLayoutStore"

interface UseTopicDesktopLayoutOptions {
	isReadOnly: boolean
	allowProjectSiderResize?: boolean
	/** Controls whether conversation collapse state survives remounts. */
	persistConversationPanelState?: boolean
}

interface UseTopicDesktopLayoutReturn {
	containerRef: RefObject<HTMLDivElement>
	containerWidthPx: number
	projectSiderWidthPx: number
	messagePanelWidthPx: number
	collapsedMessagePanelWidthPx: number
	isConversationPanelCollapsed: boolean
	isDraggingProjectSider: boolean
	isDraggingMessagePanel: boolean
	startDragProjectSider: (clientX: number) => void
	startDragMessagePanel: (clientX: number) => void
	toggleConversationPanel: () => void
	expandConversationPanel: () => void
	collapseConversationPanel: () => void
	ensureExpandedWhenDetailVisible: (shouldShowDetailPanel: boolean) => void
}

export function useTopicDesktopLayout({
	isReadOnly,
	allowProjectSiderResize = !isReadOnly,
	persistConversationPanelState = true,
}: UseTopicDesktopLayoutOptions): UseTopicDesktopLayoutReturn {
	const containerRef = useRef<HTMLDivElement>(null)
	const storeRef = useRef<TopicLayoutStore | null>(null)

	if (!storeRef.current) {
		storeRef.current = new TopicLayoutStore({ persistConversationPanelState })
	}
	const store = storeRef.current

	const startDragProjectSider = useMemoizedFn((clientX: number) => {
		if (!allowProjectSiderResize) return
		store.startDragProjectSider(clientX)
	})

	const startDragMessagePanel = useMemoizedFn((clientX: number) => {
		if (isReadOnly) return
		store.startDragMessagePanel(clientX)
	})

	const toggleConversationPanel = useMemoizedFn(() => {
		store.toggleConversationPanel()
	})

	const expandConversationPanel = useMemoizedFn(() => {
		store.expandConversationPanel()
	})

	/** Collapses the conversation panel while preserving its last expanded width. */
	const collapseConversationPanel = useMemoizedFn(() => {
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
			store.setContainerWidth(containerRef.current.clientWidth)
		}

		updateContainerWidth()
		const observer = new ResizeObserver(updateContainerWidth)
		observer.observe(container)

		return () => {
			observer.disconnect()
		}
	}, [store])

	useEffect(() => {
		if (!store.isDraggingProjectSider && !store.isDraggingMessagePanel) return

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
		const handlePointerUp = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
				flushDragPosition()
			}
			store.endDrag()
		}

		/** Cancels drag without persisting widths from a browser-aborted touch gesture. */
		const handlePointerCancel = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
				rafId = null
			}
			store.cancelDrag()
		}

		document.addEventListener("pointermove", handlePointerMove)
		document.addEventListener("pointerup", handlePointerUp)
		document.addEventListener("pointercancel", handlePointerCancel)

		return () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId)
			}
			document.removeEventListener("pointermove", handlePointerMove)
			document.removeEventListener("pointerup", handlePointerUp)
			document.removeEventListener("pointercancel", handlePointerCancel)
		}
	}, [store, store.isDraggingProjectSider, store.isDraggingMessagePanel])

	useEffect(() => {
		return () => {
			store.cancelDrag()
		}
	}, [store])

	return {
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
