import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MarketBackToTopButton from "../MarketBackToTopButton"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "backToTop" ? "Back to top" : key),
	}),
}))

describe("MarketBackToTopButton", () => {
	it("shows after the scroll threshold and scrolls the viewport to the top", () => {
		const viewport = document.createElement("div")
		const scrollTo = vi.fn()
		viewport.scrollTo = scrollTo

		render(
			<MarketBackToTopButton
				viewportRef={{ current: viewport }}
				testId="market-back-to-top"
			/>,
		)

		const button = screen.getByTestId("market-back-to-top")
		expect(button).toHaveClass("pointer-events-none", "opacity-0")
		expect(button).toHaveAttribute("aria-hidden", "true")

		viewport.scrollTop = 321
		fireEvent.scroll(viewport)

		expect(button).toHaveClass("translate-y-0", "opacity-100")
		expect(button).toHaveAttribute("aria-hidden", "false")

		fireEvent.click(button)

		expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
	})
})
