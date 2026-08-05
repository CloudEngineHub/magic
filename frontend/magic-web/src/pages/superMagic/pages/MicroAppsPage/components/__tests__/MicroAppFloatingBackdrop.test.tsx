import { createRef } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MicroAppFloatingBackdrop from "../MicroAppFloatingBackdrop"

vi.mock("@gsap/react", () => ({
	useGSAP: vi.fn(),
}))

vi.mock("gsap", () => ({
	gsap: {
		registerPlugin: vi.fn(),
	},
}))

vi.mock("gsap/ScrollTrigger", () => ({
	ScrollTrigger: {},
}))

describe("MicroAppFloatingBackdrop", () => {
	it("renders a desktop mosaic with multiple micro app previews", () => {
		render(
			<MicroAppFloatingBackdrop
				scrollContainerRef={createRef<HTMLElement>()}
				heroRef={createRef<HTMLElement>()}
				active
			/>,
		)

		expect(screen.getByTestId("micro-app-mosaic")).toHaveAttribute("data-active", "true")
		expect(screen.getAllByTestId("micro-app-mosaic-tile")).toHaveLength(8)
		const activeIndicators = document.querySelectorAll(
			'.micro-app-focus-indicator[data-active="true"]',
		)
		expect(activeIndicators).toHaveLength(9)
		activeIndicators.forEach((indicator) => {
			expect(indicator).toHaveClass("bg-[#ffd84d]")
		})
		const activeBars = document.querySelectorAll(
			'.micro-app-analytics-focus-indicator[data-active="true"]',
		)
		expect(activeBars).toHaveLength(7)
		activeBars.forEach((indicator) => {
			expect(indicator).toHaveClass("translate-y-0")
		})
	})

	it("uses a reduced mosaic on mobile", () => {
		render(
			<MicroAppFloatingBackdrop
				scrollContainerRef={createRef<HTMLElement>()}
				heroRef={createRef<HTMLElement>()}
				mobile
			/>,
		)

		expect(screen.getByTestId("micro-app-mosaic")).toHaveAttribute("data-mobile", "true")
		expect(screen.getAllByTestId("micro-app-mosaic-tile")).toHaveLength(5)
		const inactiveIndicators = document.querySelectorAll(
			'.micro-app-focus-indicator[data-active="false"]',
		)
		expect(inactiveIndicators).toHaveLength(9)
		const inactiveBars = document.querySelectorAll(
			'.micro-app-analytics-focus-indicator[data-active="false"]',
		)
		expect(inactiveBars).toHaveLength(7)
		inactiveBars.forEach((indicator) => {
			expect(indicator).toHaveClass("translate-y-full")
		})
	})
})
