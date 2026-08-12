import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MarketStickyHeader from "../MarketStickyHeader"

describe("MarketStickyHeader", () => {
	it("shows the bottom gradient only while the header is stuck", () => {
		const viewport = document.createElement("div")

		render(
			<MarketStickyHeader
				scrollViewportRef={{ current: viewport }}
				data-testid="market-sticky-header"
			>
				Search
			</MarketStickyHeader>,
		)

		const header = screen.getByTestId("market-sticky-header")
		expect(header).toHaveClass("after:opacity-0")

		vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 120 } as DOMRect)
		vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ top: 120 } as DOMRect)

		viewport.scrollTop = 200
		fireEvent.scroll(viewport)

		expect(header).toHaveClass("after:opacity-100")

		viewport.scrollTop = 0
		fireEvent.scroll(viewport)

		expect(header).toHaveClass("after:opacity-0")
	})
})
