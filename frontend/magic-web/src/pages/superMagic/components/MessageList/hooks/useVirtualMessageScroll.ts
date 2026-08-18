import {
	type MutableRefObject,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import type { Virtualizer } from "@tanstack/react-virtual"
import { debounce, throttle } from "lodash-es"
import pubsub, { PubSubEvents } from "@/utils/pubsub"

const DEFAULT_MIN_TOP_DISTANCE = 400
const MIN_BOTTOM_DISTANCE = 50
const BACK_TO_LATEST_OFFSET = 100
const MAX_ANCHOR_CORRECTION_FRAMES = 8
const ANCHOR_ERROR_TOLERANCE = 2

interface VirtualScrollItem {
	key: string
}

interface UseVirtualMessageScrollOptions {
	containerRef: RefObject<HTMLDivElement | null>
	virtualizerRef: MutableRefObject<Virtualizer<HTMLDivElement, HTMLDivElement> | null>
	items: ReadonlyArray<VirtualScrollItem>
	topicKey: string
	onPullMore?: () => void | Promise<unknown>
	/** Distance from the top at which a fresh upward gesture may load one history page. */
	minTopDistance?: number
}

interface HistoryAnchorSnapshot {
	key: string
	viewportOffset: number
	previousCount: number
	generation: number
}

function getScrollableEndOffset(
	viewport: HTMLDivElement | null,
	virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement> | null,
) {
	return Math.max(virtualizer?.getTotalSize() || 0, viewport?.scrollHeight || 0)
}

export interface UseVirtualMessageScrollReturn {
	showBackToLatest: boolean
	scrollToBottom: (behavior?: ScrollBehavior) => void
	notifyPullMoreStarted: () => void
	onVirtualizerChange: (
		instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
		sync: boolean,
	) => void
}

/**
 * Owns scroll intent independently from row mounting. History restoration uses a stable message
 * key plus its intra-row viewport offset, so dynamic estimates do not depend on total DOM height.
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

	const autoFollowRef = useRef(true)
	const guardTimerRef = useRef<number | null>(null)
	const previousScrollTopRef = useRef(0)
	const isUserScrollInteractionRef = useRef(false)
	const userHistoryIntentRef = useRef(false)
	const isLayoutCorrectionRef = useRef(false)
	const layoutCorrectionTimerRef = useRef<number | null>(null)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const suppressUntilRef = useRef(0)
	const lastTotalSizeRef = useRef(0)
	const historyGenerationRef = useRef(0)
	const historyAnchorRef = useRef<HistoryAnchorSnapshot | null>(null)
	const historyLoadStateRef = useRef<"idle" | "requesting" | "restoring">("idle")
	const historyRequestSettledRef = useRef(false)
	const historyRequestIdRef = useRef(0)
	const historyUnlockFrameRef = useRef<number | null>(null)
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
			}, duration)
		},
		[clearGuard],
	)

	const markLayoutCorrection = useCallback(() => {
		isLayoutCorrectionRef.current = true
		if (layoutCorrectionTimerRef.current !== null) {
			window.clearTimeout(layoutCorrectionTimerRef.current)
		}
		layoutCorrectionTimerRef.current = window.setTimeout(() => {
			isLayoutCorrectionRef.current = false
			layoutCorrectionTimerRef.current = null
		}, 100)
	}, [])

	const clearHistoryUnlockFrame = useCallback(() => {
		if (historyUnlockFrameRef.current === null) return
		window.cancelAnimationFrame(historyUnlockFrameRef.current)
		historyUnlockFrameRef.current = null
	}, [])

	const finishHistoryLoad = useCallback(() => {
		clearHistoryUnlockFrame()
		historyLoadStateRef.current = "idle"
		historyRequestSettledRef.current = false
		// A page request consumes exactly one gesture. Scroll events emitted while the
		// request/anchor restoration was in flight must not authorize the next page.
		userHistoryIntentRef.current = false
	}, [clearHistoryUnlockFrame])

	const scheduleHistoryUnlock = useCallback(() => {
		if (!historyRequestSettledRef.current || historyAnchorRef.current) return
		if (historyUnlockFrameRef.current !== null) return
		historyUnlockFrameRef.current = window.requestAnimationFrame(() => {
			historyUnlockFrameRef.current = null
			if (historyRequestSettledRef.current && !historyAnchorRef.current) {
				finishHistoryLoad()
			}
		})
	}, [finishHistoryLoad])

	const settleHistoryRequest = useCallback(
		(requestId: number) => {
			if (historyRequestIdRef.current !== requestId) return
			historyRequestSettledRef.current = true
			if (historyAnchorRef.current) {
				historyLoadStateRef.current = "restoring"
				clearHistoryUnlockFrame()
				historyUnlockFrameRef.current = window.requestAnimationFrame(() => {
					historyUnlockFrameRef.current = null
					const snapshot = historyAnchorRef.current
					if (
						historyRequestSettledRef.current &&
						snapshot &&
						itemsRef.current.length <= snapshot.previousCount
					) {
						// Empty/duplicate pages do not cause a list commit. Release the lock after
						// one paint, while still requiring a fresh gesture for the next request.
						historyAnchorRef.current = null
						finishHistoryLoad()
					}
				})
				return
			}
			scheduleHistoryUnlock()
		},
		[clearHistoryUnlockFrame, finishHistoryLoad, scheduleHistoryUnlock],
	)

	const scrollToBottom = useCallback(
		(behavior: ScrollBehavior = "smooth") => {
			const viewport = containerRef.current
			const virtualizer = virtualizerRef.current
			if (!viewport || !virtualizer) return
			autoFollowRef.current = true
			userHistoryIntentRef.current = false
			historyAnchorRef.current = null
			historyGenerationRef.current += 1
			startGuard(behavior === "smooth" ? 1000 : 300)
			virtualizer.scrollToOffset(getScrollableEndOffset(viewport, virtualizer), {
				align: "end",
				behavior,
			})
		},
		[containerRef, startGuard, virtualizerRef],
	)

	const notifyPullMoreStarted = useCallback(() => {
		const viewport = containerRef.current
		const virtualizer = virtualizerRef.current
		const anchorIndex = virtualizer?.range?.startIndex
		if (!viewport || !virtualizer || anchorIndex === undefined) return

		const anchorItem = itemsRef.current[anchorIndex]
		const measurement = virtualizer.measurementsCache[anchorIndex]
		if (!anchorItem || !measurement) return

		historyAnchorRef.current = {
			key: anchorItem.key,
			viewportOffset: measurement.start - viewport.scrollTop,
			previousCount: itemsRef.current.length,
			generation: ++historyGenerationRef.current,
		}
	}, [containerRef, virtualizerRef])

	if (prevTopicKeyRef.current !== topicKey) {
		prevTopicKeyRef.current = topicKey
		autoFollowRef.current = true
		previousScrollTopRef.current = 0
		userHistoryIntentRef.current = false
		isUserScrollInteractionRef.current = false
		lastTotalSizeRef.current = 0
		historyAnchorRef.current = null
		historyGenerationRef.current += 1
		historyLoadStateRef.current = "idle"
		historyRequestSettledRef.current = false
		historyRequestIdRef.current += 1
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
		if (items.length < previousItemCount) {
			// Authoritative replace/replace_tail can legitimately remove rows. The browser may
			// clamp scrollTop as the canvas shrinks; that layout correction must never be treated
			// as a user's upward gesture and must not start another history-page request.
			userHistoryIntentRef.current = false
			historyAnchorRef.current = null
			historyGenerationRef.current += 1
			suppressUntilRef.current = Date.now() + 300
			if (historyLoadStateRef.current === "idle" || historyRequestSettledRef.current) {
				finishHistoryLoad()
			}
		}

		const snapshot = historyAnchorRef.current
		const viewport = containerRef.current
		const virtualizer = virtualizerRef.current
		if (!snapshot || !viewport || !virtualizer || items.length <= snapshot.previousCount) return

		const anchorIndex = items.findIndex((item) => item.key === snapshot.key)
		if (anchorIndex < 0) {
			historyAnchorRef.current = null
			scheduleHistoryUnlock()
			return
		}

		let frame = 0
		let stableFrames = 0
		let animationFrame = 0
		const generation = snapshot.generation

		const correctAnchor = () => {
			if (historyAnchorRef.current?.generation !== generation) return
			const currentVirtualizer = virtualizerRef.current
			const currentViewport = containerRef.current
			const measurement = currentVirtualizer?.measurementsCache[anchorIndex]
			if (!currentVirtualizer || !currentViewport || !measurement) {
				if (++frame < MAX_ANCHOR_CORRECTION_FRAMES) {
					animationFrame = window.requestAnimationFrame(correctAnchor)
				} else {
					historyAnchorRef.current = null
					scheduleHistoryUnlock()
				}
				return
			}

			const targetOffset = measurement.start - snapshot.viewportOffset
			const error = targetOffset - currentViewport.scrollTop
			if (Math.abs(error) > ANCHOR_ERROR_TOLERANCE) {
				stableFrames = 0
				markLayoutCorrection()
				currentVirtualizer.scrollToOffset(targetOffset, {
					align: "start",
					behavior: "auto",
				})
			} else {
				stableFrames += 1
			}

			frame += 1
			if (stableFrames >= 2 || frame >= MAX_ANCHOR_CORRECTION_FRAMES) {
				historyAnchorRef.current = null
				scheduleHistoryUnlock()
				return
			}
			animationFrame = window.requestAnimationFrame(correctAnchor)
		}

		correctAnchor()
		return () => window.cancelAnimationFrame(animationFrame)
	}, [
		containerRef,
		finishHistoryLoad,
		items,
		markLayoutCorrection,
		scheduleHistoryUnlock,
		virtualizerRef,
	])

	useEffect(() => {
		const viewport = containerRef.current
		if (!viewport) return
		previousScrollTopRef.current = viewport.scrollTop

		const pullMessages = debounce(() => {
			if (
				userHistoryIntentRef.current &&
				historyLoadStateRef.current === "idle" &&
				guardTimerRef.current === null &&
				!isLayoutCorrectionRef.current &&
				viewport.scrollTop < minTopDistance
			) {
				userHistoryIntentRef.current = false
				historyLoadStateRef.current = "requesting"
				historyRequestSettledRef.current = false
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
				return
			}

			if (
				userHistoryIntentRef.current &&
				historyLoadStateRef.current === "idle" &&
				guardTimerRef.current === null &&
				!isLayoutCorrectionRef.current &&
				viewport.scrollTop >= minTopDistance
			) {
				// Do not carry an upward intent past the threshold. Otherwise a later
				// streaming/layout scroll could be mistaken for a new user gesture.
				userHistoryIntentRef.current = false
			}
		}, 300)

		const handleScroll = throttle(
			() => {
				const totalSize = getScrollableEndOffset(viewport, virtualizerRef.current)
				const distanceToBottom = totalSize - viewport.scrollTop - viewport.clientHeight
				const isProgrammatic =
					guardTimerRef.current !== null || isLayoutCorrectionRef.current

				if (!isProgrammatic && isUserScrollInteractionRef.current) {
					if (viewport.scrollTop < previousScrollTopRef.current) {
						if (historyLoadStateRef.current === "idle") {
							userHistoryIntentRef.current = true
						}
					} else if (viewport.scrollTop > previousScrollTopRef.current) {
						userHistoryIntentRef.current = false
					}
				}
				previousScrollTopRef.current = viewport.scrollTop

				setShowBackToLatest(
					viewport.scrollTop + viewport.clientHeight + BACK_TO_LATEST_OFFSET < totalSize,
				)
				if (!isProgrammatic) autoFollowRef.current = distanceToBottom < MIN_BOTTOM_DISTANCE
				if (
					!isProgrammatic &&
					historyLoadStateRef.current === "idle" &&
					userHistoryIntentRef.current
				)
					pullMessages()
			},
			16,
			{ leading: false, trailing: true },
		)

		const handleWheel = (event: WheelEvent) => {
			if (historyLoadStateRef.current !== "idle") {
				if (event.deltaY >= 0) userHistoryIntentRef.current = false
				return
			}
			if (event.deltaY >= 0) {
				userHistoryIntentRef.current = false
				historyAnchorRef.current = null
				historyGenerationRef.current += 1
				return
			}
			userHistoryIntentRef.current = true
			if (guardTimerRef.current === null && !isLayoutCorrectionRef.current) return
			clearGuard()
			isLayoutCorrectionRef.current = false
			autoFollowRef.current = false
		}
		const handlePointerDown = () => {
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
	}, [clearGuard, containerRef, minTopDistance, settleHistoryRequest, virtualizerRef])

	useEffect(() => {
		const viewport = containerRef.current
		const contentWrapper = viewport?.firstElementChild
		if (!viewport || !(contentWrapper instanceof HTMLElement)) return

		const observer = new ResizeObserver(() => {
			const virtualizer = virtualizerRef.current
			if (
				!virtualizer ||
				historyAnchorRef.current ||
				!autoFollowRef.current ||
				Date.now() < suppressUntilRef.current
			)
				return

			const scrollableEndOffset = getScrollableEndOffset(viewport, virtualizer)
			lastTotalSizeRef.current = scrollableEndOffset
			markLayoutCorrection()
			virtualizer.scrollToOffset(scrollableEndOffset, {
				align: "end",
				behavior: "auto",
			})
		})

		observer.observe(contentWrapper)
		resizeObserverRef.current = observer
		return () => {
			observer.disconnect()
			if (resizeObserverRef.current === observer) resizeObserverRef.current = null
		}
	}, [containerRef, markLayoutCorrection, virtualizerRef])

	const onVirtualizerChange = useCallback(
		(instance: Virtualizer<HTMLDivElement, HTMLDivElement>) => {
			const totalSize = getScrollableEndOffset(containerRef.current, instance)
			const previousTotalSize = lastTotalSizeRef.current
			lastTotalSizeRef.current = totalSize
			if (
				totalSize <= previousTotalSize ||
				historyAnchorRef.current ||
				!autoFollowRef.current ||
				Date.now() < suppressUntilRef.current
			)
				return

			markLayoutCorrection()
			instance.scrollToOffset(totalSize, { align: "end", behavior: "auto" })
		},
		[containerRef, markLayoutCorrection],
	)

	useEffect(() => {
		pubsub.subscribe(
			PubSubEvents.Message_Scroll_To_Bottom,
			(options?: { behavior?: ScrollBehavior; time?: number }) => {
				autoFollowRef.current = true
				userHistoryIntentRef.current = false
				historyAnchorRef.current = null
				historyGenerationRef.current += 1
				startGuard(options?.time || 1000)
				const virtualizer = virtualizerRef.current
				const viewport = containerRef.current
				if (virtualizer && viewport) {
					virtualizer.scrollToOffset(getScrollableEndOffset(viewport, virtualizer), {
						align: "end",
						behavior: options?.behavior || "smooth",
					})
				}
			},
		)
		pubsub.subscribe(
			PubSubEvents.Message_Register_Programmatic_Scroll,
			(options?: { time?: number }) => startGuard(options?.time || 480),
		)
		const handleSuppressAutoScroll = () => {
			suppressUntilRef.current = Date.now() + 300
		}
		pubsub.subscribe(PubSubEvents.Message_Suppress_Auto_Scroll, handleSuppressAutoScroll)

		return () => {
			pubsub.unsubscribe(PubSubEvents.Message_Scroll_To_Bottom)
			pubsub.unsubscribe(PubSubEvents.Message_Register_Programmatic_Scroll)
			pubsub.unsubscribe(PubSubEvents.Message_Suppress_Auto_Scroll, handleSuppressAutoScroll)
		}
	}, [containerRef, startGuard, virtualizerRef])

	useEffect(
		() => () => {
			clearGuard()
			clearHistoryUnlockFrame()
			if (layoutCorrectionTimerRef.current !== null) {
				window.clearTimeout(layoutCorrectionTimerRef.current)
			}
			resizeObserverRef.current?.disconnect()
		},
		[clearGuard, clearHistoryUnlockFrame],
	)

	return { showBackToLatest, scrollToBottom, notifyPullMoreStarted, onVirtualizerChange }
}
