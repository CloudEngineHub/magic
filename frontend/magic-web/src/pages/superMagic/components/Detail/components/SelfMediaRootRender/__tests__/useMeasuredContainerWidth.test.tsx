import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useMeasuredContainerWidth } from "../hooks/useMeasuredContainerWidth"

function ContainerProbe() {
	const { containerRef, width } = useMeasuredContainerWidth<HTMLDivElement>()

	return <div ref={containerRef} data-testid="container-probe" data-width={Math.round(width)} />
}

describe("useMeasuredContainerWidth", () => {
	let resizeCallback: ResizeObserverCallback | undefined
	const originalRequestAnimationFrame = window.requestAnimationFrame
	const originalCancelAnimationFrame = window.cancelAnimationFrame

	beforeEach(() => {
		class MockResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback
			}

			observe = vi.fn()
			disconnect = vi.fn()
		}

		vi.stubGlobal("ResizeObserver", MockResizeObserver)
		window.requestAnimationFrame = (callback) => {
			callback(0)
			return 1
		}
		window.cancelAnimationFrame = vi.fn()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		window.requestAnimationFrame = originalRequestAnimationFrame
		window.cancelAnimationFrame = originalCancelAnimationFrame
		resizeCallback = undefined
	})

	it("updates width from the observed container instead of the viewport", async () => {
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 720,
				bottom: 160,
				width: 720,
				height: 160,
				toJSON: () => ({}),
			})

		render(<ContainerProbe />)

		act(() => {
			resizeCallback?.(
				[
					{
						contentRect: { width: 240 },
					} as ResizeObserverEntry,
				],
				{} as ResizeObserver,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("container-probe")).toHaveAttribute("data-width", "720")
		})

		getBoundingClientRect.mockRestore()
	})
})
