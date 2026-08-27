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
	it("gives the style content a bounded height so the scroll area can scroll", () => {
		const boundaryRef = createRef<HTMLDivElement>()

		render(
			<div ref={boundaryRef}>
				<ElementContextPanel
					editorRef={{ current: null }}
					anchor={{ top: 80, left: 80, width: 120, height: 40 }}
					selector="section.hero"
					boundaryRef={boundaryRef}
					onClose={vi.fn()}
				/>
			</div>,
		)

		const panel = document.querySelector("[data-html-context-panel]")
		if (!panel) throw new Error("context panel was not rendered")

		expect(panel).toHaveStyle({ height: "420px", maxHeight: "420px" })
		expect(panel).toHaveClass("flex", "flex-col")
		const viewport = panel.querySelector('[data-slot="scroll-area-viewport"]')
		expect(viewport).toHaveClass(
			"h-full",
			"min-h-0",
			"touch-pan-y",
			"overflow-x-hidden",
			"overflow-y-auto",
		)
		expect(viewport).toHaveStyle({ overflowX: "hidden", overflowY: "auto" })
		expect(panel.querySelector('[data-slot="scroll-area"]')).toHaveClass("min-h-0", "flex-1")
		expect(panel.querySelector('[data-slot="scroll-area"]')).not.toHaveClass("overflow-hidden")
		expect(panel.querySelector('[data-testid="mock-style-panel"]')?.parentElement).toHaveClass(
			"pr-3",
		)
		const closeButton = panel.querySelector('button[aria-label="stylePanel.closeContextPanel"]')
		expect(closeButton).toHaveClass("absolute", "right-2", "top-2", "z-20")
		expect(closeButton?.parentElement).not.toHaveClass("h-7")
	})
})
