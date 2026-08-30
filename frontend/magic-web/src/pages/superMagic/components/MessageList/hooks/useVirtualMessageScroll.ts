import {
	type MutableRefObject,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { debounce, throttle } from "lodash-es"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { MessageListScrollAdapter } from "../message-list-scroll-adapter"
import { MESSAGE_LIST_VIEWPORT_SELECTOR } from "../message-list-viewport"
import {
	beginExplicitScroll,
	beginFollowOutput,
	beginHistoryAnchor,
	beginUserScroll,
	canFollowOutput,
	finishCorrection,
	initialScrollOwnership,
	type ScrollOwnershipState,
} from "../scroll-ownership"

const DEFAULT_MIN_TOP_DISTANCE = 400
const MIN_BOTTOM_DISTANCE = 50
const BACK_TO_LATEST_OFFSET = 100
const SHRINK_SUPPRESS_DURATION = 300

interface VirtualScrollItem {
	key: string
}

interface UseVirtualMessageScrollOptions {
	containerRef: RefObject<HTMLDivElement | null>
	virtualizerRef: MutableRefObject<MessageListScrollAdapter | null>
	items: ReadonlyArray<VirtualScrollItem>
	topicKey: string
	onPullMore?: () => void | Promise<unknown>
	/** Distance from the top at which a fresh upward gesture may load one history page. */
	minTopDistance?: number
}

export interface UseVirtualMessageScrollReturn {
	showBackToLatest: boolean
	scrollToBottom: (behavior?: ScrollBehavior) => void
	notifyPullMoreStarted: () => void
	onVirtualizerChange: (instance: MessageListScrollAdapter, sync: boolean) => void
}

/**
 * Owns scroll *intent*; the virtualizer owns scroll *position*.
 *
 * Keeping the viewport stable across prepends and row measurement is `shift` + the virtualizer's
 * internal compensation, so this hook never restores an anchor by hand. It only issues the two
 * writes a chat list genuinely needs — an explicit jump to latest, and following streaming output
 * while the user is parked at the bottom — and gates both through the ownership state machine so
 * they can never fight a gesture that is still in progress.
 */
export function useVirtualMessageScroll({
	containerRef,
	virtualizerRef,
	items,
	topicKey,
	onPullMore,
	minTopDistance = DEFAULT_MIN_TOP_DISTANCE,
}: UseVirtualMessageScrollOptions): UseVirtualMessageScrollReturn {
	const [showBackToLatest, setShowBackToLatest] = useState(false)
	const itemsRef = useRef(items)
	itemsRef.current = items
	const onPullMoreRef = useRef(onPullMore)
	onPullMoreRef.current = onPullMore

	const ownershipRef = useRef<ScrollOwnershipState>(initialScrollOwnership())
	/**
	 * Sticky follow preference, deliberately distinct from "currently near the bottom": a fresh
	 * topic must land at the latest message even though its viewport starts at offset 0.
	 */
	const autoFollowRef = useRef(true)
	const guardTimerRef = useRef<number | null>(null)
	const previousScrollTopRef = useRef(0)
	const isUserScrollInteractionRef = useRef(false)
	const userHistoryIntentRef = useRef(false)
	const lastScrollSizeRef = useRef(0)
	const historyLoadStateRef = useRef<"idle" | "requesting">("idle")
	const historyRequestIdRef = useRef(0)
	const prevTopicKeyRef = useRef(topicKey)
	const previousItemCountRef = useRef(items.length)

	const clearGuard = useCallback(() => {
		if (guardTimerRef.current === null) return
		window.clearTimeout(guardTimerRef.current)
		guardTimerRef.current = null
	}, [])

	const startGuard = useCallback(
		(duration: number) => {
			clearGuard()
			guardTimerRef.current = window.setTimeout(() => {
				guardTimerRef.current = null
				ownershipRef.current = finishCorrection(ownershipRef.current, "explicit")
			}, duration)
		},
		[clearGuard],
	)

	const scrollToLatest = useCallback(
		(smooth: boolean) => {
			const virtualizer = virtualizerRef.current
			if (!virtualizer) return
			const lastIndex = virtualizer.itemCount - 1
			if (lastIndex < 0) return
			virtualizer.scrollToIndex(lastIndex, { align: "end", smooth })
		},
		[virtualizerRef],
	)

	const scrollToBottom = useCallback(
		(behavior: ScrollBehavior = "smooth") => {
			autoFollowRef.current = true
			userHistoryIntentRef.current = false
			ownershipRef.current = beginExplicitScroll(ownershipRef.current)
			startGuard(behavior === "smooth" ? 1000 : 300)
			scrollToLatest(behavior === "smooth")
		},
		[scrollToLatest, startGuard],
	)

	/**
	 * Retained for the eight `handlePullMoreMessage(topic, callback)` call sites. Anchor capture
	 * is gone — the virtualizer's `shift` compensation covers restoration — so this only records
	 * that a history page owns the next layout pass.
	 */
	const notifyPullMoreStarted = useCallback(() => {
		ownershipRef.current = beginHistoryAnchor(
			ownershipRef.current,
			ownershipRef.current.generation + 1,
		)
	}, [])

	const finishHistoryLoad = useCallback(() => {
		historyLoadStateRef.current = "idle"
		// A page request consumes exactly one gesture; scroll events emitted while it was in
		// flight must not authorize the next page.
		userHistoryIntentRef.current = false
		ownershipRef.current = finishCorrection(ownershipRef.current, "history-anchor")
	}, [])

	if (prevTopicKeyRef.current !== topicKey) {
		prevTopicKeyRef.current = topicKey
		autoFollowRef.current = true
		previousScrollTopRef.current = 0
		userHistoryIntentRef.current = false
		isUserScrollInteractionRef.current = false
		lastScrollSizeRef.current = 0
		historyLoadStateRef.current = "idle"
		historyRequestIdRef.current += 1
		ownershipRef.current = initialScrollOwnership()
		previousItemCountRef.current = items.length
	}

	useEffect(() => {
		setShowBackToLatest(false)
		clearGuard()
		finishHistoryLoad()
		scrollToBottom("auto")
	}, [clearGuard, finishHistoryLoad, scrollToBottom, topicKey])

	useLayoutEffect(() => {
		const previousItemCount = previousItemCountRef.current
		previousItemCountRef.current = items.length
		if (items.length >= previousItemCount) return

		// Authoritative replace/replace_tail can legitimately remove rows. The browser clamps
		// scrollTop as the canvas shrinks; that layout correction is not an upward gesture and
		// must not start another history-page request or a follow write.
		userHistoryIntentRef.current = false
		ownershipRef.current = {
			...ownershipRef.current,
			generation: ownershipRef.current.generation + 1,
			userIntent: "none",
			suppressUntil: Date.now() + SHRINK_SUPPRESS_DURATION,
		}
		if (historyLoadStateRef.current === "idle") finishHistoryLoad()
	}, [finishHistoryLoad, items])

	useEffect(() => {
		const viewport = containerRef.current
		if (!viewport) return undefined
		previousScrollTopRef.current = viewport.scrollTop

		const settleHistoryRequest = (requestId: number) => {
			if (historyRequestIdRef.current !== requestId) return
			finishHistoryLoad()
		}

		const pullMessages = debounce(() => {
			if (
				!userHistoryIntentRef.current ||
				historyLoadStateRef.current !== "idle" ||
				guardTimerRef.current !== null
			) {
				return
			}

			if (viewport.scrollTop >= minTopDistance) {
				// Do not carry an upward intent past the threshold, otherwise a later
				// streaming/layout scroll could be mistaken for a new user gesture.
				userHistoryIntentRef.current = false
				return
			}

			userHistoryIntentRef.current = false
			historyLoadStateRef.current = "requesting"
			ownershipRef.current = beginHistoryAnchor(
				ownershipRef.current,
				ownershipRef.current.generation + 1,
			)
			const requestId = ++historyRequestIdRef.current
			let result: void | Promise<unknown>
			try {
				result = onPullMoreRef.current?.()
			} catch {
				settleHistoryRequest(requestId)
				return
			}
			void Promise.resolve(result).then(
				() => settleHistoryRequest(requestId),
				() => settleHistoryRequest(requestId),
			)
		}, 300)

		const handleScroll = throttle(
			() => {
				const scrollSize = viewport.scrollHeight
				const distanceToBottom = scrollSize - viewport.scrollTop - viewport.clientHeight
				const nearBottom = distanceToBottom < MIN_BOTTOM_DISTANCE
				const isProgrammatic = guardTimerRef.current !== null
				const movedUp = viewport.scrollTop < previousScrollTopRef.current
				const movedDown = viewport.scrollTop > previousScrollTopRef.current
				previousScrollTopRef.current = viewport.scrollTop

				if (
					!isProgrammatic &&
					isUserScrollInteractionRef.current &&
					(movedUp || movedDown)
				) {
					ownershipRef.current = beginUserScroll(
						ownershipRef.current,
						movedUp ? "backward" : "forward",
						nearBottom,
					)
					if (movedUp) {
						if (historyLoadStateRef.current === "idle") {
							userHistoryIntentRef.current = true
						}
					} else {
						userHistoryIntentRef.current = false
					}
				}

				setShowBackToLatest(
					viewport.scrollTop + viewport.clientHeight + BACK_TO_LATEST_OFFSET < scrollSize,
				)

				if (!isProgrammatic) {
					if (
						movedUp &&
						(isUserScrollInteractionRef.current || userHistoryIntentRef.current)
					) {
						autoFollowRef.current = false
					} else if (nearBottom && movedDown) {
						// Re-enable follow only after an explicit downward gesture reaches bottom.
						autoFollowRef.current = true
					}
				}

				if (
					!isProgrammatic &&
					historyLoadStateRef.current === "idle" &&
					userHistoryIntentRef.current
				) {
					pullMessages()
				}
			},
			16,
			{ leading: false, trailing: true },
		)

		/**
		 * A gesture inside a nested scroller (code block preview, share shell) belongs to that
		 * element. The main viewport no longer carries `data-slot="scroll-area-viewport"`, so a
		 * non-nested target simply resolves to null or to the viewport itself.
		 */
		const isNestedScrollGesture = (target: EventTarget | null) => {
			const nested =
				target instanceof Element ? target.closest(MESSAGE_LIST_VIEWPORT_SELECTOR) : null
			return Boolean(nested) && nested !== viewport
		}

		const handleWheel = (event: WheelEvent) => {
			if (isNestedScrollGesture(event.target)) return

			if (historyLoadStateRef.current !== "idle") {
				if (event.deltaY >= 0) userHistoryIntentRef.current = false
				return
			}
			if (event.deltaY >= 0) {
				userHistoryIntentRef.current = false
				return
			}
			userHistoryIntentRef.current = true
			// User intent must win immediately, even while the viewport is still within the
			// bottom tolerance. Otherwise a resize in the same gesture can pull it back down.
			autoFollowRef.current = false
			ownershipRef.current = beginUserScroll(ownershipRef.current, "backward", false)
			clearGuard()
		}
		const handlePointerDown = (event: PointerEvent) => {
			if (isNestedScrollGesture(event.target)) return
			isUserScrollInteractionRef.current = true
		}
		const handlePointerEnd = () => {
			isUserScrollInteractionRef.current = false
		}

		viewport.addEventListener("scroll", handleScroll)
		viewport.addEventListener("wheel", handleWheel, { passive: true })
		viewport.addEventListener("pointerdown", handlePointerDown, { passive: true })
		window.addEventListener("pointerup", handlePointerEnd, { passive: true })
		window.addEventListener("pointercancel", handlePointerEnd, { passive: true })

		return () => {
			viewport.removeEventListener("scroll", handleScroll)
			viewport.removeEventListener("wheel", handleWheel)
			viewport.removeEventListener("pointerdown", handlePointerDown)
			window.removeEventListener("pointerup", handlePointerEnd)
			window.removeEventListener("pointercancel", handlePointerEnd)
			pullMessages.cancel()
			handleScroll.cancel()
		}
	}, [clearGuard, containerRef, finishHistoryLoad, minTopDistance])

	const onVirtualizerChange = useCallback((instance: MessageListScrollAdapter) => {
		const scrollSize = instance.scrollSize
		const previousScrollSize = lastScrollSizeRef.current
		lastScrollSizeRef.current = scrollSize

		if (
			!canFollowOutput(ownershipRef.current, {
				totalSizeIncreased: scrollSize > previousScrollSize,
				nearBottom: autoFollowRef.current,
			})
		) {
			return
		}

		const lastIndex = instance.itemCount - 1
		if (lastIndex < 0) return
		ownershipRef.current = beginFollowOutput(ownershipRef.current)
		instance.scrollToIndex(lastIndex, { align: "end" })
		ownershipRef.current = finishCorrection(ownershipRef.current, "follow-output")
	}, [])

	useEffect(() => {
		pubsub.subscribe(
			PubSubEvents.Message_Scroll_To_Bottom,
			(options?: { behavior?: ScrollBehavior; time?: number }) => {
				autoFollowRef.current = true
				userHistoryIntentRef.current = false
				ownershipRef.current = beginExplicitScroll(ownershipRef.current)
				startGuard(options?.time || 1000)
				scrollToLatest(options?.behavior !== "auto")
			},
		)
		pubsub.subscribe(
			PubSubEvents.Message_Register_Programmatic_Scroll,
			(options?: { time?: number }) => startGuard(options?.time || 480),
		)
		const handleSuppressAutoScroll = () => {
			ownershipRef.current = {
				...ownershipRef.current,
				suppressUntil: Date.now() + SHRINK_SUPPRESS_DURATION,
			}
		}
		pubsub.subscribe(PubSubEvents.Message_Suppress_Auto_Scroll, handleSuppressAutoScroll)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Message_Scroll_To_Bottom)
			pubsub.unsubscribe(PubSubEvents.Message_Register_Programmatic_Scroll)
			pubsub.unsubscribe(PubSubEvents.Message_Suppress_Auto_Scroll, handleSuppressAutoScroll)
		}
	}, [scrollToLatest, startGuard])

	useEffect(() => () => clearGuard(), [clearGuard])

	return { showBackToLatest, scrollToBottom, notifyPullMoreStarted, onVirtualizerChange }
}
