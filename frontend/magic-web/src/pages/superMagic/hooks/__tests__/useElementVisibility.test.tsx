import { act, renderHook, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useElementVisibility } from "../useElementVisibility"

describe("useElementVisibility", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("falls back to visible when IntersectionObserver is unavailable", () => {
		vi.stubGlobal("IntersectionObserver", undefined)
		const element = document.createElement("div")
		const ref = createRef<HTMLDivElement>()
		Object.defineProperty(ref, "current", { value: element })

		const { result } = renderHook(() => useElementVisibility(ref))

		expect(result.current).toBe(true)
	})

	it("updates visibility from IntersectionObserver and disconnects on unmount", async () => {
		let callback: IntersectionObserverCallback | undefined
		const disconnect = vi.fn()
		vi.stubGlobal(
			"IntersectionObserver",
			vi.fn((nextCallback: IntersectionObserverCallback) => {
				callback = nextCallback
				return { observe: vi.fn(), disconnect }
			}),
		)
		const element = document.createElement("div")
		const ref = createRef<HTMLDivElement>()
		Object.defineProperty(ref, "current", { value: element })

		const { result, unmount } = renderHook(() => useElementVisibility(ref))
		act(() => {
			callback?.(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})

		await waitFor(() => expect(result.current).toBe(true))
		unmount()
		expect(disconnect).toHaveBeenCalledTimes(1)
	})
})
