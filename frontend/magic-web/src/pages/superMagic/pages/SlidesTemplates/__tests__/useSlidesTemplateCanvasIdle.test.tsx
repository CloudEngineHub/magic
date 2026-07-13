import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS,
	useSlidesTemplateCanvasIdle,
} from "../useSlidesTemplateCanvasIdle"

describe("useSlidesTemplateCanvasIdle", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("starts idle animation after inactivity and stops it on interaction", () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useSlidesTemplateCanvasIdle({ disabled: false }))

		expect(result.current.isIdle).toBe(false)
		act(() => {
			vi.advanceTimersByTime(SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS)
		})
		expect(result.current.isIdle).toBe(true)

		act(() => result.current.markActive())
		expect(result.current.isIdle).toBe(false)
		act(() => {
			vi.advanceTimersByTime(SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS)
		})
		expect(result.current.isIdle).toBe(true)
	})

	it("does not enter idle state while canvas animation is disabled", () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useSlidesTemplateCanvasIdle({ disabled: true }))

		act(() => {
			vi.advanceTimersByTime(SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS * 2)
		})
		expect(result.current.isIdle).toBe(false)
	})

	it("returns to idle immediately after the pointer leaves the canvas", () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useSlidesTemplateCanvasIdle({ disabled: false }))

		act(() => result.current.markActive())
		expect(result.current.isIdle).toBe(false)
		act(() => result.current.markInactive())
		expect(result.current.isIdle).toBe(true)
	})
})
