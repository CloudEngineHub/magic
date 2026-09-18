import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useConversationCompactMode } from "../useConversationCompactMode"

/** Set the synthetic desktop window height used by the compact-mode boundary. */
function setWindowHeight(height: number) {
	Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
}

describe("useConversationCompactMode", () => {
	it("enters compact mode below 760px and exits at the boundary", () => {
		setWindowHeight(759)
		const { result } = renderHook(() => useConversationCompactMode())
		expect(result.current).toBe(true)

		act(() => {
			setWindowHeight(760)
			window.dispatchEvent(new Event("resize"))
		})
		expect(result.current).toBe(false)

		act(() => {
			setWindowHeight(761)
			window.dispatchEvent(new Event("resize"))
		})
		expect(result.current).toBe(false)
	})

	it("stays inactive and removes the resize listener when disabled", () => {
		setWindowHeight(600)
		const removeEventListener = vi.spyOn(window, "removeEventListener")
		const { result, rerender, unmount } = renderHook(
			({ enabled }: { enabled: boolean }) => useConversationCompactMode({ enabled }),
			{ initialProps: { enabled: true } },
		)
		expect(result.current).toBe(true)

		rerender({ enabled: false })
		expect(result.current).toBe(false)
		expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function))

		unmount()
		removeEventListener.mockRestore()
	})
})
