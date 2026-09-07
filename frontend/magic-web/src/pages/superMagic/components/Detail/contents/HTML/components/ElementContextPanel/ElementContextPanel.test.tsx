import { createRef, type ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElementContextPanel } from "./ElementContextPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../StylePanel", () => ({
	StylePanel: ({ children }: { children?: ReactNode }) => (
		<div data-testid="mock-style-panel" style={{ minHeight: 1200 }}>
			{children}
		</div>
	),
}))

describe("ElementContextPanel", () => {
	it("renders a compact bottom-toolbar surface", () => {
		const boundaryRef = createRef<HTMLDivElement>()

		render(
			<div ref={boundaryRef}>
				<ElementContextPanel
					editorRef={{ current: null }}
					anchor={{ top: 80, left: 80, width: 120, height: 40 }}
					selector="section.hero"
					boundaryRef={boundaryRef}
				/>
			</div>,
		)

		const panel = document.querySelector("[data-html-context-panel]")
		if (!panel) throw new Error("context panel was not rendered")

		expect(panel).toHaveClass(
			"flex",
			"h-auto",
			"w-fit",
			"items-start",
			"overflow-visible",
			"rounded-lg",
		)
		expect(panel.className).not.toMatch(/overflow-x-auto|overflow-y-auto/)
		expect(panel).toHaveStyle({ maxWidth: "680px" })
		expect(panel).not.toHaveStyle({ height: "48px" })
		expect(panel.querySelector('[data-testid="mock-style-panel"]')?.parentElement).toHaveClass(
			"min-w-0",
			"w-fit",
			"max-w-full",
		)
		expect(panel.querySelector('button[aria-label="stylePanel.closeContextPanel"]')).toBeNull()
	})

	it("keeps the toolbar mounted when switching selected elements", () => {
		const { rerender } = render(
			<ElementContextPanel
				editorRef={{ current: null }}
				anchor={{ top: 80, left: 80, width: 120, height: 40 }}
				selector="section.hero"
			/>,
		)
		const stylePanel = document.querySelector('[data-testid="mock-style-panel"]')

		rerender(
			<ElementContextPanel
				editorRef={{ current: null }}
				anchor={{ top: 120, left: 120, width: 120, height: 40 }}
				selector="section.card"
			/>,
		)

		expect(document.querySelector('[data-testid="mock-style-panel"]')).toBe(stylePanel)
	})

	it.each([
		["above", { top: -80, left: 80, width: 120, height: 40 }],
		["below", { top: window.innerHeight + 20, left: 80, width: 120, height: 40 }],
	])("hides the toolbar when the selected element is completely %s the viewport", (_, anchor) => {
		render(
			<ElementContextPanel
				editorRef={{ current: null }}
				anchor={anchor}
				selector="section.hero"
			/>,
		)

		expect(document.querySelector("[data-html-context-panel]")).toBeNull()
	})
})
