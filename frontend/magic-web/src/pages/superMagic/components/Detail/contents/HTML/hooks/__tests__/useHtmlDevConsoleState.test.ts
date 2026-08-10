import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useHtmlDevConsoleState } from "../useHtmlDevConsoleState"

describe("useHtmlDevConsoleState", () => {
	it("keeps debug state scoped to the current HTML file and restores it after remount", () => {
		const firstFileId = "dev-console-state-first"
		const secondFileId = "dev-console-state-second"
		const onRegisterToggle = vi.fn()
		const onEnabledChange = vi.fn()
		const { result, rerender, unmount } = renderHook(
			({ fileId }) => useHtmlDevConsoleState({ fileId, onRegisterToggle, onEnabledChange }),
			{ initialProps: { fileId: firstFileId } },
		)

		act(() => result.current.toggle())
		expect(result.current.enabled).toBe(true)

		rerender({ fileId: secondFileId })
		expect(result.current.enabled).toBe(false)

		act(() => result.current.toggle())
		expect(result.current.enabled).toBe(true)

		rerender({ fileId: firstFileId })
		expect(result.current.enabled).toBe(true)
		unmount()

		const remounted = renderHook(() =>
			useHtmlDevConsoleState({ fileId: firstFileId, onEnabledChange }),
		)
		expect(remounted.result.current.enabled).toBe(true)
		expect(onEnabledChange).toHaveBeenLastCalledWith(true)
	})

	it("registers an external toggle and clears it on unmount", () => {
		const onRegisterToggle = vi.fn()
		const { unmount } = renderHook(() =>
			useHtmlDevConsoleState({
				fileId: "dev-console-state-register",
				onRegisterToggle,
			}),
		)

		expect(onRegisterToggle).toHaveBeenCalledWith(expect.any(Function))
		unmount()
		expect(onRegisterToggle).toHaveBeenLastCalledWith(null)
	})
})
