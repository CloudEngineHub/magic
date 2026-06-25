import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useStepHeaderCompact } from "../components/SelfMediaInitPanel/hooks/useStepHeaderCompact"

function createViewport({
	scrollHeight,
	clientHeight,
}: {
	scrollHeight: number
	clientHeight: number
}) {
	const viewport = document.createElement("div")

	Object.defineProperty(viewport, "scrollHeight", {
		configurable: true,
		value: scrollHeight,
	})
	Object.defineProperty(viewport, "clientHeight", {
		configurable: true,
		value: clientHeight,
	})

	return viewport
}

function scrollViewport(viewport: HTMLDivElement, scrollTop: number) {
	act(() => {
		viewport.scrollTop = scrollTop
		viewport.dispatchEvent(new Event("scroll"))
	})
}

describe("useStepHeaderCompact", () => {
	it("uses hysteresis so the header does not flicker around the compact threshold", () => {
		const viewport = createViewport({ scrollHeight: 1200, clientHeight: 720 })
		const { result } = renderHook(() => useStepHeaderCompact(0, false))

		act(() => {
			result.current.setViewportRef(viewport)
		})

		expect(result.current.isCompact).toBe(false)

		scrollViewport(viewport, 40)
		expect(result.current.isCompact).toBe(false)

		scrollViewport(viewport, 60)
		expect(result.current.isCompact).toBe(true)

		scrollViewport(viewport, 20)
		expect(result.current.isCompact).toBe(true)

		scrollViewport(viewport, 0)
		expect(result.current.isCompact).toBe(false)
	})

	it("keeps the full header when the content cannot provide enough range after collapsing", () => {
		const viewport = createViewport({ scrollHeight: 880, clientHeight: 720 })
		const { result } = renderHook(() => useStepHeaderCompact(0, false))

		act(() => {
			result.current.setViewportRef(viewport)
		})

		scrollViewport(viewport, 60)

		expect(result.current.isCompact).toBe(false)
	})
})
