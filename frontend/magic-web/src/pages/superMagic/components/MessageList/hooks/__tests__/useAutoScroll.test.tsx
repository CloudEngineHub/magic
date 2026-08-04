import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAutoScroll } from "../useAutoScroll"

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
	scrollHeight,
}: {
	scrollTop: number
	clientHeight: number
	scrollHeight: number
}) {
	const viewport = document.createElement("div")
	const content = document.createElement("div")
	viewport.appendChild(content)

	let scrollTop = initialScrollTop
	Object.defineProperties(viewport, {
		clientHeight: { configurable: true, value: clientHeight },
		scrollHeight: { configurable: true, value: scrollHeight },
		scrollTop: {
			configurable: true,
			get: () => scrollTop,
			set: (value: number) => {
				scrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
			},
		},
	})
	viewport.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
		viewport.scrollTop = Number(top || 0)
		viewport.dispatchEvent(new Event("scroll"))
	})

	return viewport
}

describe("useAutoScroll", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.stubGlobal("ResizeObserver", ControlledResizeObserver)
		resizeObserverCallback = undefined
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("does not load history when streaming layout changes programmatically scroll the viewport", async () => {
		const viewport = createViewport({ scrollTop: 0, clientHeight: 300, scrollHeight: 500 })
		const onPullMore = vi.fn()

		renderHook(() =>
			useAutoScroll({
				containerRef: { current: viewport },
				topicKey: "topic-1",
				onPullMore,
			}),
		)

		act(() => {
			resizeObserverCallback?.([], {} as ResizeObserver)
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).not.toHaveBeenCalled()
	})

	it("does not infer human intent from a non-interactive scroll position change", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300, scrollHeight: 1200 })
		const onPullMore = vi.fn()

		renderHook(() =>
			useAutoScroll({
				containerRef: { current: viewport },
				topicKey: "topic-1",
				onPullMore,
			}),
		)

		act(() => {
			viewport.scrollTop = 100
			viewport.dispatchEvent(new Event("scroll"))
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(500)
		})

		expect(onPullMore).not.toHaveBeenCalled()
	})

	it("loads history once when a user explicitly scrolls upward into the top threshold", async () => {
		const viewport = createViewport({ scrollTop: 900, clientHeight: 300, scrollHeight: 1200 })
		const onPullMore = vi.fn()

		renderHook(() =>
			useAutoScroll({
				containerRef: { current: viewport },
				topicKey: "topic-1",
				onPullMore,
			}),
		)

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
})
