import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import useMonitorSoftKeyboard from "../useMonitorSoftKeyboard"

const IOS_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

/** Dispatch a document-level focus event from an editable element. */
function dispatchFocusEvent(
	target: HTMLElement,
	type: "focusin" | "focusout",
	relatedTarget: HTMLElement | null = null,
) {
	target.dispatchEvent(
		new FocusEvent(type, {
			bubbles: true,
			relatedTarget,
		}),
	)
}

describe("useMonitorSoftKeyboard", () => {
	let originalUserAgent: string
	let originalVisualViewport: VisualViewport | null

	beforeEach(() => {
		originalUserAgent = navigator.userAgent
		originalVisualViewport = window.visualViewport
		vi.useFakeTimers()

		Object.defineProperty(navigator, "userAgent", {
			configurable: true,
			value: IOS_USER_AGENT,
		})
		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: undefined,
		})
	})

	afterEach(() => {
		vi.useRealTimers()
		document.body.replaceChildren()
		Object.defineProperty(navigator, "userAgent", {
			configurable: true,
			value: originalUserAgent,
		})
		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: originalVisualViewport,
		})
	})

	it("keeps the default focus-in and focus-out delays", () => {
		const input = document.createElement("input")
		document.body.append(input)
		const { result } = renderHook(() => useMonitorSoftKeyboard())

		act(() => dispatchFocusEvent(input, "focusin"))
		expect(result.current.isUp).toBe(false)

		act(() => vi.advanceTimersByTime(99))
		expect(result.current.isUp).toBe(false)

		act(() => vi.advanceTimersByTime(1))
		expect(result.current.isUp).toBe(true)

		act(() => dispatchFocusEvent(input, "focusout"))
		act(() => vi.advanceTimersByTime(299))
		expect(result.current.isUp).toBe(true)

		act(() => vi.advanceTimersByTime(1))
		expect(result.current.isUp).toBe(false)
	})

	it("closes immediately when focusOutDelay is zero", () => {
		const input = document.createElement("input")
		document.body.append(input)
		const { result } = renderHook(() =>
			useMonitorSoftKeyboard({
				focusOutDelay: 0,
			}),
		)

		act(() => dispatchFocusEvent(input, "focusin"))
		act(() => vi.advanceTimersByTime(100))
		expect(result.current.isUp).toBe(true)

		act(() => dispatchFocusEvent(input, "focusout"))
		expect(result.current.isUp).toBe(false)
	})

	it("keeps the keyboard open when focus moves to another editable element", () => {
		const firstInput = document.createElement("input")
		const secondInput = document.createElement("textarea")
		document.body.append(firstInput, secondInput)
		const { result } = renderHook(() => useMonitorSoftKeyboard())

		act(() => dispatchFocusEvent(firstInput, "focusin"))
		act(() => vi.advanceTimersByTime(100))

		act(() => dispatchFocusEvent(firstInput, "focusout", secondInput))
		act(() => vi.advanceTimersByTime(300))

		expect(result.current.isUp).toBe(true)
	})

	it("cancels a stale close timer when another input receives focus", () => {
		const firstInput = document.createElement("input")
		const secondInput = document.createElement("input")
		document.body.append(firstInput, secondInput)
		const { result } = renderHook(() => useMonitorSoftKeyboard())

		act(() => dispatchFocusEvent(firstInput, "focusin"))
		act(() => vi.advanceTimersByTime(100))
		act(() => dispatchFocusEvent(firstInput, "focusout"))
		act(() => dispatchFocusEvent(secondInput, "focusin"))
		act(() => vi.advanceTimersByTime(300))

		expect(result.current.isUp).toBe(true)
	})

	it("clears pending focus timers when unmounted", () => {
		const input = document.createElement("input")
		document.body.append(input)
		const callback = vi.fn()
		const { unmount } = renderHook(() => useMonitorSoftKeyboard({ callback }))
		callback.mockClear()

		act(() => dispatchFocusEvent(input, "focusin"))
		unmount()
		act(() => vi.runAllTimers())

		expect(callback).not.toHaveBeenCalled()
	})
})
