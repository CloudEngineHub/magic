import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { debounce, throttle } from "lodash-es"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

const MIN_TOP_DISTANCE = 400
const MIN_BOTTOM_DISTANCE = 50
const BACK_TO_LATEST_OFFSET = 100

interface UseAutoScrollOptions {
	containerRef: RefObject<HTMLDivElement | null>
	topicKey: string
	onPullMore?: () => void
}

interface UseAutoScrollReturn {
	showBackToLatest: boolean
	scrollToBottom: (behavior?: ScrollBehavior) => void
	notifyPullMoreStarted: () => void
}

/**
 * Manages auto-scroll-to-bottom for a scrollable message list.
 *
 * Uses a ResizeObserver on the content wrapper to follow new content,
 * a scroll-guard mechanism to protect programmatic scrolls from user-scroll
 * interference, and PubSub integration for external scroll requests.
 */
export function useAutoScroll({
	containerRef,
	topicKey,
	onPullMore,
}: UseAutoScrollOptions): UseAutoScrollReturn {
	const [showBackToLatest, setShowBackToLatest] = useState(false)

	const autoFollowRef = useRef(true)
	const guardTimerRef = useRef<number | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const prevTopicKeyRef = useRef(topicKey)
	const onPullMoreRef = useRef(onPullMore)
	onPullMoreRef.current = onPullMore
	const previousScrollTopRef = useRef(0)
	const isUserScrollInteractionRef = useRef(false)
	const userHistoryIntentRef = useRef(false)

	const isResizeScrollingRef = useRef(false)
	const resizeScrollTimerRef = useRef<number>(0)
	const suppressUntilRef = useRef(0)

	const pullMoreSnapshotRef = useRef<{
		scrollTop: number
		scrollHeight: number
	} | null>(null)

	const clearGuard = useCallback(() => {
		if (guardTimerRef.current !== null) {
			window.clearTimeout(guardTimerRef.current)
			guardTimerRef.current = null
		}
	}, [])

	const startGuard = useCallback(
		(duration: number) => {
			clearGuard()
			guardTimerRef.current = window.setTimeout(() => {
				guardTimerRef.current = null
			}, duration)
		},
		[clearGuard],
	)

	const scrollToBottom = useCallback(
		(behavior: ScrollBehavior = "smooth") => {
			const el = containerRef.current
			if (!el) return
			autoFollowRef.current = true
			userHistoryIntentRef.current = false
			startGuard(behavior === "smooth" ? 1000 : 300)
			el.scrollTo({ top: el.scrollHeight, behavior })
		},
		[containerRef, startGuard],
	)

	const notifyPullMoreStarted = useCallback(() => {
		const el = containerRef.current
		if (!el) return
		pullMoreSnapshotRef.current = {
			scrollTop: el.scrollTop,
			scrollHeight: el.scrollHeight,
		}
	}, [containerRef])

	// Reset on topic change (render-phase, skips first render)
	if (prevTopicKeyRef.current !== topicKey) {
		prevTopicKeyRef.current = topicKey
		autoFollowRef.current = true
		pullMoreSnapshotRef.current = null
		previousScrollTopRef.current = 0
		isUserScrollInteractionRef.current = false
		userHistoryIntentRef.current = false
	}

	// Scroll to bottom + reset UI on topic change (including initial mount)
	useEffect(() => {
		setShowBackToLatest(false)
		clearGuard()
		const el = containerRef.current
		if (el) el.scrollTop = el.scrollHeight
	}, [topicKey, clearGuard, containerRef])

	// ResizeObserver: auto-scroll when content height changes
	useEffect(() => {
		const viewport = containerRef.current
		if (!viewport) return

		const contentWrapper = viewport.firstElementChild as HTMLElement | null
		if (!contentWrapper) return

		const observer = new ResizeObserver(() => {
			if (pullMoreSnapshotRef.current) {
				const { scrollTop, scrollHeight } = pullMoreSnapshotRef.current
				// 只有当内容高度增加时才执行 pullMore 恢复逻辑（拉取更多消息只会增加内容）。
				// 如果高度减少或不变，说明是其他操作（如引用展开/收起）触发的 resize，
				// 应丢弃过期的 snapshot，走正常逻辑。
				if (viewport.scrollHeight > scrollHeight) {
					pullMoreSnapshotRef.current = null
					// Restoring the viewport after older messages are inserted is a layout correction,
					// not a new user request to continue loading history.
					isResizeScrollingRef.current = true
					window.clearTimeout(resizeScrollTimerRef.current)
					viewport.scrollTop = scrollTop + (viewport.scrollHeight - scrollHeight)
					resizeScrollTimerRef.current = window.setTimeout(() => {
						isResizeScrollingRef.current = false
					}, 100)
					return
				}
				// snapshot 过期，丢弃
				pullMoreSnapshotRef.current = null
			}

			const now = Date.now()

			if (!autoFollowRef.current) return

			if (now < suppressUntilRef.current) {
				return
			}

			isResizeScrollingRef.current = true
			window.clearTimeout(resizeScrollTimerRef.current)
			viewport.scrollTop = viewport.scrollHeight
			resizeScrollTimerRef.current = window.setTimeout(() => {
				isResizeScrollingRef.current = false
			}, 100)
		})

		observer.observe(contentWrapper)
		resizeObserverRef.current = observer

		return () => {
			observer.disconnect()
			resizeObserverRef.current = null
		}
	}, [containerRef])

	// Scroll + wheel event handlers
	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		previousScrollTopRef.current = el.scrollTop

		const pullMessages = debounce(() => {
			if (
				userHistoryIntentRef.current &&
				guardTimerRef.current === null &&
				!isResizeScrollingRef.current &&
				el.scrollTop < MIN_TOP_DISTANCE
			) {
				// One explicit upward gesture starts at most one page request. Further pages require
				// another user gesture so streaming/layout scrolls cannot create a request loop.
				userHistoryIntentRef.current = false
				onPullMoreRef.current?.()
			}
		}, 300)

		const handleScroll = throttle(
			() => {
				const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
				const isProgrammaticScroll =
					guardTimerRef.current !== null || isResizeScrollingRef.current
				if (!isProgrammaticScroll && isUserScrollInteractionRef.current) {
					if (el.scrollTop < previousScrollTopRef.current) {
						userHistoryIntentRef.current = true
					} else if (el.scrollTop > previousScrollTopRef.current) {
						userHistoryIntentRef.current = false
					}
				}
				previousScrollTopRef.current = el.scrollTop

				setShowBackToLatest(
					el.scrollTop + el.clientHeight + BACK_TO_LATEST_OFFSET < el.scrollHeight,
				)

				if (!isProgrammaticScroll) {
					autoFollowRef.current = distanceToBottom < MIN_BOTTOM_DISTANCE
				}

				if (!isProgrammaticScroll && userHistoryIntentRef.current) pullMessages()
			},
			16,
			{ leading: false, trailing: true },
		)

		const handleWheel = (event: WheelEvent) => {
			if (event.deltaY >= 0) {
				userHistoryIntentRef.current = false
				return
			}
			userHistoryIntentRef.current = true
			if (guardTimerRef.current === null && !isResizeScrollingRef.current) return
			clearGuard()
			if (isResizeScrollingRef.current) {
				window.clearTimeout(resizeScrollTimerRef.current)
				isResizeScrollingRef.current = false
			}
			autoFollowRef.current = false
		}
		const handlePointerDown = () => {
			isUserScrollInteractionRef.current = true
		}
		const handlePointerEnd = () => {
			isUserScrollInteractionRef.current = false
		}

		el.addEventListener("scroll", handleScroll)
		el.addEventListener("wheel", handleWheel, { passive: true })
		el.addEventListener("pointerdown", handlePointerDown, { passive: true })
		window.addEventListener("pointerup", handlePointerEnd, { passive: true })
		window.addEventListener("pointercancel", handlePointerEnd, { passive: true })

		return () => {
			el.removeEventListener("scroll", handleScroll)
			el.removeEventListener("wheel", handleWheel)
			el.removeEventListener("pointerdown", handlePointerDown)
			window.removeEventListener("pointerup", handlePointerEnd)
			window.removeEventListener("pointercancel", handlePointerEnd)
			pullMessages.cancel()
			handleScroll.cancel()
		}
	}, [containerRef, clearGuard])

	// PubSub subscriptions
	useEffect(() => {
		pubsub.subscribe(
			PubSubEvents.Message_Scroll_To_Bottom,
			(options?: { behavior?: ScrollBehavior; time?: number }) => {
				const el = containerRef.current
				if (!el) return
				autoFollowRef.current = true
				userHistoryIntentRef.current = false
				startGuard(options?.time || 1000)
				el.scrollTo({
					top: el.scrollHeight,
					behavior: options?.behavior || "smooth",
				})
			},
		)
		pubsub.subscribe(
			PubSubEvents.Message_Register_Programmatic_Scroll,
			(options?: { time?: number }) => {
				startGuard(options?.time || 480)
			},
		)

		const handleSuppressAutoScroll = () => {
			suppressUntilRef.current = Date.now() + 300
		}
		pubsub.subscribe(PubSubEvents.Message_Suppress_Auto_Scroll, handleSuppressAutoScroll)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Message_Scroll_To_Bottom)
			pubsub.unsubscribe(PubSubEvents.Message_Register_Programmatic_Scroll)
			pubsub.unsubscribe(
				PubSubEvents.Message_Suppress_Auto_Scroll,
				handleSuppressAutoScroll as any,
			)
		}
	}, [containerRef, startGuard])

	// Cleanup on unmount
	useEffect(
		() => () => {
			clearGuard()
			window.clearTimeout(resizeScrollTimerRef.current)
			resizeObserverRef.current?.disconnect()
		},
		[clearGuard],
	)

	return { showBackToLatest, scrollToBottom, notifyPullMoreStarted }
}
