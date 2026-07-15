import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SlidesTemplateCanvasControls from "../SlidesTemplateCanvasControls"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("SlidesTemplateCanvasControls", () => {
	it("keeps the remaining edge navigation buttons dark on hover", () => {
		render(
			<SlidesTemplateCanvasControls
				canZoomIn
				canZoomOut
				onMove={vi.fn()}
				onReset={vi.fn()}
				onZoomIn={vi.fn()}
				onZoomOut={vi.fn()}
				scale={1}
			/>,
		)

		const moveUpButton = screen.getByTestId("slides-template-canvas-move-up")
		expect(moveUpButton).toHaveClass("hover:bg-zinc-950/[0.92]")
		expect(moveUpButton).not.toHaveClass("hover:bg-zinc-800")
		expect(screen.queryByTestId("slides-template-canvas-move-down")).not.toBeInTheDocument()
	})
})
