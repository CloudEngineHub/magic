import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useScrollAreaAutoScroll } from "../useScrollAreaAutoScroll"

let resizeObserverCallback: ResizeObserverCallback | undefined
let nextAnimationFrameId = 1
const animationFrameCallbacks = new Map<number, FrameRequestCallback>()

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
	scrollHeight: initialScrollHeight,
}: {
	scrollTop: number
	clientHeight: number
	scrollHeight: number
}) {
	const viewport = document.createElement("div")
	viewport.appendChild(document.createElement("div"))

	let scrollTop = initialScrollTop
	let scrollHeight = initialScrollHeight
	Object.defineProperties(viewport, {
		clientHeight: { configurable: true, value: clientHeight },
		scrollHeight: { configurable: true, get: () => scrollHeight },
		scrollTop: {
			configurable: true,
			get: () => scrollTop,
			set: (value: number) => {
				scrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
			},
		},
	})

	return {
		viewport,
		setScrollHeight(value: number) {
			scrollHeight = value
		},
	}
}

function flushAnimationFrame() {
	const callbacks = Array.from(animationFrameCallbacks.values())
	animationFrameCallbacks.clear()
	callbacks.forEach((callback) => callback(performance.now()))
}

function triggerResize() {
	resizeObserverCallback?.([], {} as ResizeObserver)
}

describe("useScrollAreaAutoScroll", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		resizeObserverCallback = undefined
		nextAnimationFrameId = 1
		animationFrameCallbacks.clear()
		vi.stubGlobal("ResizeObserver", ControlledResizeObserver)
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = nextAnimationFrameId
			nextAnimationFrameId += 1
			animationFrameCallbacks.set(id, callback)
			return id
		})
		vi.stubGlobal("cancelAnimationFrame", (id: number) => {
			animationFrameCallbacks.delete(id)
		})
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("keeps following when a delayed programmatic scroll event arrives after more content", () => {
		const { viewport, setScrollHeight } = createViewport({
			scrollTop: 0,
			clientHeight: 200,
			scrollHeight: 600,
		})
		const { result } = renderHook(() => useScrollAreaAutoScroll({ isStreaming: true }))

		act(() => result.current.viewportRef(viewport))
		act(triggerResize)
		expect(viewport.scrollTop).toBe(400)

		act(() => vi.advanceTimersByTime(81))
		setScrollHeight(900)
		act(() => viewport.dispatchEvent(new Event("scroll")))
		act(triggerResize)

		expect(viewport.scrollTop).toBe(700)
	})

	it("uses a follow-up frame to catch content that grows after the resize callback", () => {
		const { viewport, setScrollHeight } = createViewport({
			scrollTop: 0,
			clientHeight: 200,
			scrollHeight: 600,
		})
		const { result } = renderHook(() => useScrollAreaAutoScroll({ isStreaming: true }))

		act(() => result.current.viewportRef(viewport))
		act(triggerResize)
		expect(viewport.scrollTop).toBe(400)

		setScrollHeight(900)
		act(flushAnimationFrame)

		expect(viewport.scrollTop).toBe(700)
	})

	it("pauses following when the user explicitly scrolls upward", () => {
		const { viewport, setScrollHeight } = createViewport({
			scrollTop: 0,
			clientHeight: 200,
			scrollHeight: 600,
		})
		const { result } = renderHook(() => useScrollAreaAutoScroll({ isStreaming: true }))

		act(() => result.current.viewportRef(viewport))
		act(triggerResize)
		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 250
			viewport.dispatchEvent(new Event("scroll"))
		})

		setScrollHeight(900)
		act(triggerResize)

		expect(viewport.scrollTop).toBe(250)
	})

	it("resumes following after the user returns to the bottom", () => {
		const { viewport, setScrollHeight } = createViewport({
			scrollTop: 0,
			clientHeight: 200,
			scrollHeight: 600,
		})
		const { result } = renderHook(() => useScrollAreaAutoScroll({ isStreaming: true }))

		act(() => result.current.viewportRef(viewport))
		act(triggerResize)
		act(() => {
			viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }))
			viewport.scrollTop = 250
			viewport.dispatchEvent(new Event("scroll"))
		})

		viewport.scrollTop = 400
		act(() => viewport.dispatchEvent(new Event("scroll")))
		setScrollHeight(900)
		act(triggerResize)

		expect(viewport.scrollTop).toBe(700)
	})
})
