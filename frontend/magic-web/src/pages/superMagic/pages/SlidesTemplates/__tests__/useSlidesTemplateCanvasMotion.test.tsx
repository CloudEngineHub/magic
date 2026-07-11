import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useSlidesTemplateCanvasMotion } from "../useSlidesTemplateCanvasMotion"

describe("useSlidesTemplateCanvasMotion", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it("continues edge movement without a finite content boundary", () => {
		vi.useFakeTimers()
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
			window.setTimeout(() => callback(performance.now()), 16),
		)
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) =>
			window.clearTimeout(frameId),
		)
		const offsetRef = { current: { x: 0, y: 0 } }
		const setCanvasOffset = vi.fn((nextOffset: { x: number; y: number }) => {
			offsetRef.current = nextOffset
			return nextOffset
		})
		const { result, unmount } = renderHook(() =>
			useSlidesTemplateCanvasMotion({
				maybeRequestMore: vi.fn(() => false),
				offsetRef,
				setCanvasOffset,
			}),
		)

		act(() => {
			result.current.scheduleEdgeMovement(
				{
					bottom: 600,
					height: 600,
					left: 0,
					right: 800,
					top: 0,
					width: 800,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				},
				{ clientX: 2, clientY: 300 },
			)
			vi.advanceTimersByTime(1000)
		})
		const firstOffset = offsetRef.current.x

		act(() => vi.advanceTimersByTime(1000))

		expect(firstOffset).toBeGreaterThan(0)
		expect(offsetRef.current.x).toBeGreaterThan(firstOffset)
		expect(setCanvasOffset).toHaveBeenCalled()
		unmount()
	})
})
