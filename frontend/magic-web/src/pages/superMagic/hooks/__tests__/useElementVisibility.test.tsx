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

	it("requires the configured intersection ratio inside a referenced root", async () => {
		let callback: IntersectionObserverCallback | undefined
		let observerOptions: IntersectionObserverInit | undefined
		vi.stubGlobal(
			"IntersectionObserver",
			vi.fn(
				(
					nextCallback: IntersectionObserverCallback,
					nextOptions: IntersectionObserverInit,
				) => {
					callback = nextCallback
					observerOptions = nextOptions
					return { observe: vi.fn(), disconnect: vi.fn() }
				},
			),
		)
		const element = document.createElement("div")
		const root = document.createElement("div")
		const ref = createRef<HTMLDivElement>()
		const rootRef = createRef<HTMLDivElement>()
		Object.defineProperty(ref, "current", { value: element })
		Object.defineProperty(rootRef, "current", { value: root })

		const { result } = renderHook(() =>
			useElementVisibility(ref, {
				minimumIntersectionRatio: 0.99,
				rootMargin: "0px -48px",
				rootRef,
				threshold: [0, 0.99, 1],
			}),
		)

		expect(observerOptions).toMatchObject({ root, rootMargin: "0px -48px" })
		act(() => {
			callback?.(
				[{ intersectionRatio: 0.8, isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})
		expect(result.current).toBe(false)

		act(() => {
			callback?.(
				[{ intersectionRatio: 1, isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})
		await waitFor(() => expect(result.current).toBe(true))
	})
})
