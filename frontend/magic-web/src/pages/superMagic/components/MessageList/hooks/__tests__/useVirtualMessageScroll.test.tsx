import { act, cleanup, renderHook } from "@testing-library/react"
import type { MutableRefObject } from "react"
import type { MessageListScrollAdapter } from "../../message-list-scroll-adapter"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useVirtualMessageScroll } from "../useVirtualMessageScroll"

let resizeObserverCallback: ResizeObserverCallback | undefined

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
	},
	PubSubEvents: {
		Message_Scroll_To_Bottom: "Message_Scroll_To_Bottom",
		Message_Register_Programmatic_Scroll: "Message_Register_Programmatic_Scroll",
		Message_Suppress_Auto_Scroll: "Message_Suppress_Auto_Scroll",
	},
}))

class ControlledResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		resizeObserverCallback = callback
	}

	observe = vi.fn()
	disconnect = vi.fn()
}

function createViewport({
	scrollTop: initialScrollTop,
	clientHeight,
	scrollHeight = clientHeight,
}: {
	scrollTop: number
	clientHeight: number
	scrollHeight?: number
}) {
	const viewport = document.createElement("div")
	viewport.appendChild(document.createElement("div"))
	let scrollTop = initialScrollTop
	Object.defineProperties(viewport, {
		clientHeight: { configurable: true, value: clientHeight },
		scrollHeight: { configurable: true, value: scrollHeight },
		scrollTop: {
			configurable: true,
			get: () => scrollTop,
			set: (value: number) => {
				scrollTop = Math.max(0, value)
			},
		},
	})
	viewport.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
		viewport.scrollTop = Number(top || 0)
		viewport.dispatchEvent(new Event("scroll"))
	}) as typeof viewport.scrollTo
	return viewport
}

function createVirtualizer(
	viewport: HTMLDivElement,
	options: {
		startIndex: number
		starts: number[]
		totalSize: number
	},
) {
	const virtualizer = {
		range: { startIndex: options.startIndex, endIndex: options.startIndex + 1 },
		offsets: new Map(
			options.starts.map((start, index) => [String.fromCharCode(97 + index), start]),
		),
		measurementsCache: options.starts.map((start, index) => ({
			index,
			key: index,
			start,
			end: start + 80,
			size: 80,
			lane: 0,
		})),
		getVirtualItems: () => [],
		getTotalSize: () => options.totalSize,
		getFirstVisibleItemKey: () => "b",
		getItemOffset: (key: string) => virtualizer.offsets.get(key),
		scrollToOffset: vi.fn((offset: number) => {
			viewport.scrollTop = offset
			viewport.dispatchEvent(new Event("scroll"))
		}),
	} as unknown as MessageListScrollAdapter

	return virtualizer
}

describe("useVirtualMessageScroll", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal("ResizeObserver", ControlledResizeObserver)
		resizeObserverCallback = undefined
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
			window.setTimeout(() => callback(performance.now()), 16),
		)
		vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle))
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("loads one history page only after an explicit upward gesture", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1200,
		})
		const onPullMore = vi.fn()

		renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
				onPullMore,
			}),
		)
		act(() => {
			vi.advanceTimersByTime(301)
		})

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 100
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).toHaveBeenCalledTimes(1)
	})

	it("honors a custom top threshold and does not reuse an intent created outside it", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1200,
		})
		const onPullMore = vi.fn()

		renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
				onPullMore,
				minTopDistance: 30,
			}),
		)
		act(() => {
			vi.advanceTimersByTime(301)
		})

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 31
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})
		expect(onPullMore).not.toHaveBeenCalled()

		// A later layout scroll crossing the threshold must not consume the old gesture.
		act(() => {
			viewport.scrollTop = 20
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})
		expect(onPullMore).not.toHaveBeenCalled()

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 10
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).toHaveBeenCalledTimes(1)
	})

	it("locks history pagination until the request and view restoration have completed", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 1,
			starts: [0, 500, 700],
			totalSize: 900,
		})
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const containerRef = { current: viewport }
		const initialItems = [{ key: "a" }, { key: "b" }, { key: "c" }]
		let resolvePullMore: (() => void) | undefined
		let notifyPullMoreStarted = () => undefined
		const onPullMore = vi.fn(() => {
			notifyPullMoreStarted()
			return new Promise<void>((resolve) => {
				resolvePullMore = resolve
			})
		})

		const { result, rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
					onPullMore,
					minTopDistance: 30,
				}),
			{ initialProps: { items: initialItems } },
		)
		notifyPullMoreStarted = result.current.notifyPullMoreStarted
		act(() => {
			vi.advanceTimersByTime(301)
			viewport.scrollTop = 20
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})
		expect(onPullMore).toHaveBeenCalledTimes(1)

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})
		expect(onPullMore).toHaveBeenCalledTimes(1)

		virtualizer.range = { startIndex: 3, endIndex: 4 }
		virtualizer.offsets = new Map([
			["x", 0],
			["y", 100],
			["a", 200],
			["b", 900],
			["c", 1100],
		])
		rerender({ items: [{ key: "x" }, { key: "y" }, ...initialItems] })
		await act(async () => {
			resolvePullMore?.()
			await vi.advanceTimersByTimeAsync(64)
		})

		act(() => {
			viewport.scrollTop = 20
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).toHaveBeenCalledTimes(2)
	})

	it("does not turn a prior downward wheel into history intent for later layout scrolls", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1200,
		})
		const onPullMore = vi.fn()

		renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
				onPullMore,
			}),
		)
		act(() => {
			vi.advanceTimersByTime(301)
		})

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }))
			viewport.scrollTop = 100
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).not.toHaveBeenCalled()
	})

	it("ignores wheel gestures originating inside a nested ScrollArea", async () => {
		const viewport = createViewport({ scrollTop: 20, clientHeight: 300, scrollHeight: 1200 })
		const nestedViewport = document.createElement("div")
		nestedViewport.dataset.slot = "scroll-area-viewport"
		viewport.firstElementChild?.appendChild(nestedViewport)
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 0,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1200,
		})
		const onPullMore = vi.fn()

		renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
				onPullMore,
				minTopDistance: 30,
			}),
		)

		act(() => {
			nestedViewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }))
			viewport.scrollTop = 10
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).not.toHaveBeenCalled()
	})

	it("restores a prepended page from the same stable message key and intra-row offset", async () => {
		const viewport = createViewport({ scrollTop: 450, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 1,
			starts: [0, 500, 700],
			totalSize: 900,
		})
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const containerRef = { current: viewport }
		const initialItems = [{ key: "a" }, { key: "b" }, { key: "c" }]

		const { result, rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
				}),
			{ initialProps: { items: initialItems } },
		)

		// Initial mount intentionally follows the latest message; emulate the user scrolling back
		// to the row that will be used as the pagination anchor.
		viewport.scrollTop = 450
		vi.mocked(virtualizer.scrollToOffset).mockClear()
		act(() => result.current.notifyPullMoreStarted())

		virtualizer.range = { startIndex: 3, endIndex: 4 }
		virtualizer.offsets = new Map([
			["x", 0],
			["y", 100],
			["a", 200],
			["b", 900],
			["c", 1100],
		])
		rerender({ items: [{ key: "x" }, { key: "y" }, ...initialItems] })

		await act(async () => {
			await vi.advanceTimersByTimeAsync(64)
		})

		expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(850, {
			align: "start",
			behavior: "auto",
		})
		expect(viewport.scrollTop).toBe(850)
	})

	it("keeps waiting for a delayed anchor until the correction deadline", async () => {
		const viewport = createViewport({ scrollTop: 450, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 1,
			starts: [0, 500, 700],
			totalSize: 900,
		})
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const containerRef = { current: viewport }
		const initialItems = [{ key: "a" }, { key: "b" }, { key: "c" }]
		let anchorMounted = true
		const getItemOffset = virtualizer.getItemOffset
		virtualizer.getItemOffset = (key: string) => {
			if (key === "b" && !anchorMounted) return undefined
			return getItemOffset(key)
		}

		const { result, rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
				}),
			{ initialProps: { items: initialItems } },
		)

		viewport.scrollTop = 450
		vi.mocked(virtualizer.scrollToOffset).mockClear()
		act(() => result.current.notifyPullMoreStarted())
		anchorMounted = false
		virtualizer.offsets = new Map([
			["x", 0],
			["y", 100],
			["a", 200],
			["b", 900],
			["c", 1100],
		])
		rerender({ items: [{ key: "x" }, { key: "y" }, ...initialItems] })

		await act(async () => {
			await vi.advanceTimersByTimeAsync(9 * 16)
		})
		anchorMounted = true
		await act(async () => {
			await vi.advanceTimersByTimeAsync(16)
		})

		expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(850, {
			align: "start",
			behavior: "auto",
		})
	})

	it("does not restore the history anchor for a middle insertion", async () => {
		const viewport = createViewport({ scrollTop: 450, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 1,
			starts: [0, 500, 700],
			totalSize: 900,
		})
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const containerRef = { current: viewport }
		const initialItems = [{ key: "a" }, { key: "b" }, { key: "c" }]

		const { result, rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
				}),
			{ initialProps: { items: initialItems } },
		)

		viewport.scrollTop = 450
		act(() => result.current.notifyPullMoreStarted())
		virtualizer.offsets = new Map([
			["a", 0],
			["x", 500],
			["b", 700],
			["c", 900],
		])
		vi.mocked(virtualizer.scrollToOffset).mockClear()
		rerender({ items: [{ key: "a" }, { key: "x" }, { key: "b" }, { key: "c" }] })

		await act(async () => {
			await vi.advanceTimersByTimeAsync(64)
		})

		expect(virtualizer.scrollToOffset).not.toHaveBeenCalledWith(650, {
			align: "start",
			behavior: "auto",
		})
	})

	it("does not request history when authoritative reconciliation shrinks the list", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1200,
		})
		const onPullMore = vi.fn()
		const initialItems = Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` }))
		const containerRef = { current: viewport }
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const { rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
					onPullMore,
				}),
			{ initialProps: { items: initialItems } },
		)

		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 100
			viewport.dispatchEvent(new Event("scroll"))
		})
		const scrollCallCountBeforeShrink = vi.mocked(virtualizer.scrollToOffset).mock.calls.length

		// A visible-tab HTTP replace can remove local rows. The resulting scrollTop clamp is
		// a layout side effect, not a request to load older history.
		rerender({ items: initialItems.slice(0, 4) })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).not.toHaveBeenCalled()
		expect(virtualizer.scrollToOffset).toHaveBeenCalledTimes(scrollCallCountBeforeShrink)
	})

	it("cancels a pending history anchor when the user explicitly returns to latest", async () => {
		const viewport = createViewport({ scrollTop: 450, clientHeight: 300 })
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 1,
			starts: [0, 500, 700],
			totalSize: 900,
		})
		const virtualizerRef = {
			current: virtualizer,
		} as MutableRefObject<MessageListScrollAdapter | null>
		const containerRef = { current: viewport }
		const initialItems = [{ key: "a" }, { key: "b" }, { key: "c" }]

		const { result, rerender } = renderHook(
			({ items }) =>
				useVirtualMessageScroll({
					containerRef,
					virtualizerRef,
					items,
					topicKey: "topic-1",
				}),
			{ initialProps: { items: initialItems } },
		)

		viewport.scrollTop = 450
		act(() => result.current.notifyPullMoreStarted())
		act(() => result.current.scrollToBottom("auto"))
		vi.mocked(virtualizer.scrollToOffset).mockClear()

		virtualizer.range = { startIndex: 3, endIndex: 4 }
		virtualizer.offsets = new Map([
			["x", 0],
			["y", 100],
			["a", 200],
			["b", 900],
			["c", 1100],
		])
		rerender({ items: [{ key: "x" }, { key: "y" }, ...initialItems] })

		await act(async () => {
			await vi.advanceTimersByTimeAsync(64)
		})

		expect(virtualizer.scrollToOffset).not.toHaveBeenCalledWith(850, {
			align: "start",
			behavior: "auto",
		})
	})

	it("scrolls past the virtual canvas to include bottom loading and footer content", () => {
		const viewport = createViewport({
			scrollTop: 0,
			clientHeight: 300,
			scrollHeight: 1200,
		})
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 0,
			starts: [0],
			totalSize: 1000,
		})

		const { result } = renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: [{ key: "message-0" }],
				topicKey: "topic-1",
			}),
		)

		vi.mocked(virtualizer.scrollToOffset).mockClear()
		act(() => result.current.scrollToBottom("auto"))

		expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(1200, {
			align: "end",
			behavior: "auto",
		})
	})

	it("keeps auto-follow at the actual bottom when non-virtual footer content grows", () => {
		const viewport = createViewport({
			scrollTop: 700,
			clientHeight: 300,
			scrollHeight: 1000,
		})
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 0,
			starts: [0],
			totalSize: 1000,
		})

		renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: [{ key: "message-0" }],
				topicKey: "topic-1",
			}),
		)

		vi.mocked(virtualizer.scrollToOffset).mockClear()
		Object.defineProperty(viewport, "scrollHeight", {
			configurable: true,
			value: 1200,
		})
		act(() => {
			resizeObserverCallback?.([], {} as ResizeObserver)
			vi.advanceTimersByTime(16)
		})

		expect(virtualizer.scrollToOffset).toHaveBeenCalledWith(1200, {
			align: "end",
			behavior: "auto",
		})
	})

	it("disables auto-follow immediately when an upward wheel starts near the bottom", async () => {
		const viewport = createViewport({
			scrollTop: 699,
			clientHeight: 300,
			scrollHeight: 1000,
		})
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1000,
		})

		const { unmount } = renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
			}),
		)

		vi.mocked(virtualizer.scrollToOffset).mockClear()
		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 }))
			viewport.scrollTop = 698
			viewport.dispatchEvent(new Event("scroll"))
			vi.advanceTimersByTime(20)
		})

		Object.defineProperty(viewport, "scrollHeight", {
			configurable: true,
			value: 1200,
		})
		act(() => {
			resizeObserverCallback?.([], {} as ResizeObserver)
			vi.advanceTimersByTime(16)
		})

		expect(virtualizer.scrollToOffset).not.toHaveBeenCalled()
		unmount()
	})

	it("coalesces duplicate bottom-follow requests from one layout update", async () => {
		const viewport = createViewport({
			scrollTop: 700,
			clientHeight: 300,
			scrollHeight: 1200,
		})
		const virtualizer = createVirtualizer(viewport, {
			startIndex: 8,
			starts: Array.from({ length: 12 }, (_, index) => index * 100),
			totalSize: 1000,
		})

		const { result } = renderHook(() =>
			useVirtualMessageScroll({
				containerRef: { current: viewport },
				virtualizerRef: { current: virtualizer },
				items: Array.from({ length: 12 }, (_, index) => ({ key: `message-${index}` })),
				topicKey: "topic-1",
			}),
		)

		vi.mocked(virtualizer.scrollToOffset).mockClear()
		act(() => {
			result.current.onVirtualizerChange(virtualizer, false)
			resizeObserverCallback?.([], {} as ResizeObserver)
			vi.advanceTimersByTime(16)
		})

		expect(virtualizer.scrollToOffset).toHaveBeenCalledTimes(1)
	})
})
