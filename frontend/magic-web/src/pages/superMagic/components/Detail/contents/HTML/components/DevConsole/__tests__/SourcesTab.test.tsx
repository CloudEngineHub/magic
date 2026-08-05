import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SourcesTab } from "../SourcesTab"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: () => ({
		getTotalSize: () => 18,
		getVirtualItems: () => [{ index: 0, key: 0, start: 0, size: 18 }],
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
	}),
}))

describe("SourcesTab", () => {
	it("keeps scrolling inside the code area without chaining to its parent", () => {
		render(<SourcesTab sourceCode="<html />" />)

		expect(screen.getByTestId("sources-tab")).toHaveClass("min-h-0", "overflow-hidden")
		expect(screen.getByTestId("sources-scroll-container")).toHaveClass(
			"overflow-auto",
			"overscroll-contain",
		)
	})

	it("removes all padding from search highlights so line height stays stable", () => {
		const { container } = render(<SourcesTab sourceCode="<html />" />)

		fireEvent.click(screen.getByTestId("set-show-search"))
		fireEvent.change(screen.getByTestId("set-search-text"), { target: { value: "html" } })

		expect(container.querySelector("mark")).toHaveClass("p-0")
		expect(container.querySelector("mark")).not.toHaveClass("px-0")
	})
})
