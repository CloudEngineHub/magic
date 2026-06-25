import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { usePhoneScaling } from "../hooks/usePhoneScaling"

describe("usePhoneScaling", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("subtracts fixed horizontal space before calculating scale", () => {
		let resizeCallback: ResizeObserverCallback | undefined

		class MockResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback
			}

			observe = vi.fn()
			unobserve = vi.fn()
			disconnect = vi.fn()
		}

		vi.stubGlobal("ResizeObserver", MockResizeObserver)

		function Probe() {
			const { containerRef, scale } = usePhoneScaling<HTMLDivElement>({
				designWidth: 421,
				designHeight: 880,
				padding: 24,
				fixedWidth: 36,
			})

			return (
				<div ref={containerRef}>
					<span data-testid="phone-scale">{scale}</span>
				</div>
			)
		}

		render(<Probe />)

		act(() => {
			resizeCallback?.(
				[
					{
						contentRect: {
							width: 400,
							height: 1000,
						},
					} as ResizeObserverEntry,
				],
				{} as ResizeObserver,
			)
		})

		expect(Number(screen.getByTestId("phone-scale").textContent)).toBeCloseTo(316 / 421, 5)
	})
})
