import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDevConsole } from "../useDevConsole"

describe("useDevConsole", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("applies the requested state idempotently after an iframe refresh", () => {
		const postMessage = vi.fn()
		const iframeRef = {
			current: { contentWindow: { postMessage } } as unknown as HTMLIFrameElement,
		}
		const { result } = renderHook(() => useDevConsole({ iframeRef }))

		act(() => {
			result.current.setEnabled(true)
			result.current.setEnabled(true)
		})

		expect(result.current.enabled).toBe(true)
		expect(postMessage).toHaveBeenCalledTimes(2)
		expect(postMessage.mock.calls[0][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_EVAL",
		})
		expect(postMessage.mock.calls[1][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: true,
		})

		act(() => result.current.toggle())
		expect(result.current.enabled).toBe(false)
		expect(postMessage).toHaveBeenCalledTimes(4)
		expect(postMessage.mock.calls[2][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: false,
		})
		expect(postMessage.mock.calls[3][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_EVAL",
		})
	})

	it("preserves the parent bridge when DevTools is re-enabled after a runtime refresh", () => {
		vi.useFakeTimers()
		const postMessage = vi.fn()
		const contentWindow = { postMessage } as unknown as Window
		const iframeRef = {
			current: { contentWindow } as unknown as HTMLIFrameElement,
		}
		const { result } = renderHook(() => useDevConsole({ iframeRef }))

		act(() => result.current.setEnabled(true))
		postMessage.mockClear()

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: { type: "MAGIC_DEVTOOLS_RUNTIME_READY" },
					source: contentWindow,
				}),
			)
			vi.advanceTimersByTime(100)
		})

		expect(postMessage).toHaveBeenCalledTimes(2)
		expect(postMessage.mock.calls[0][0]).toMatchObject({ type: "MAGIC_DEVTOOLS_EVAL" })
		expect(postMessage.mock.calls[1][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: true,
		})
	})
})
