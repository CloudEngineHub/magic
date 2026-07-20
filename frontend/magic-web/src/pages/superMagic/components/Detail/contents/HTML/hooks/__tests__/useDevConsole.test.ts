import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useDevConsole } from "../useDevConsole"

describe("useDevConsole", () => {
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
		expect(postMessage).toHaveBeenCalledOnce()
		expect(postMessage.mock.calls[0][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: true,
		})

		act(() => result.current.toggle())
		expect(result.current.enabled).toBe(false)
		expect(postMessage).toHaveBeenCalledTimes(2)
		expect(postMessage.mock.calls[1][0]).toMatchObject({ enabled: false })
	})
})
