import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useZoomControls } from "../useZoomControls"

describe("useZoomControls", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"ResizeObserver",
			class ResizeObserver {
				observe = vi.fn()
				disconnect = vi.fn()
			},
		)
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0)
			return 0
		})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it("handles trackpad pinch gestures dispatched inside the PPT iframe", async () => {
		const container = document.createElement("div")
		Object.defineProperties(container, {
			offsetWidth: { value: 960 },
			offsetHeight: { value: 800 },
			clientWidth: { value: 960 },
			clientHeight: { value: 800 },
		})
		container.scrollTo = vi.fn()

		const iframe = document.createElement("iframe")
		document.body.appendChild(iframe)

		const { result } = renderHook(() =>
			useZoomControls({
				containerRef: { current: container },
				iframeRef: { current: iframe },
				isPptRender: true,
				iframeLoaded: true,
				contentInjected: true,
				scaleContentDimensions: { width: 1920, height: 1080 },
			}),
		)

		await waitFor(() => {
			expect(result.current.scaleRatio).toBeCloseTo(0.5, 5)
		})

		const wheelEvent = new WheelEvent("wheel", {
			ctrlKey: true,
			deltaY: -50,
			cancelable: true,
		})
		act(() => {
			iframe.contentWindow?.dispatchEvent(wheelEvent)
		})

		await waitFor(() => {
			expect(result.current.scaleRatio).toBeCloseTo(0.6, 5)
		})
		expect(wheelEvent.defaultPrevented).toBe(true)
	})
})
