import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import MinimapButton from "../MinimapButton"

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}))

function renderMinimapButton(active = false, onToggle = vi.fn()) {
	const result = render(
		<TooltipProvider delayDuration={0}>
			<MinimapButton active={active} panelId="minimap-panel" onToggle={onToggle} />
		</TooltipProvider>,
	)

	return { ...result, onToggle }
}

describe("MinimapButton tooltip", () => {
	it("shows only while the pointer hovers an inactive button", () => {
		renderMinimapButton()
		const button = screen.getByRole("button", { name: "小地图" })

		fireEvent.pointerEnter(button)
		expect(screen.getByRole("tooltip")).toHaveTextContent("小地图")

		fireEvent.pointerCancel(button)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("does not show from focus alone", () => {
		renderMinimapButton()
		const button = screen.getByRole("button", { name: "小地图" })

		fireEvent.focus(button)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("clears the tooltip on click and keeps it closed after window focus returns", () => {
		const { onToggle } = renderMinimapButton()
		const button = screen.getByRole("button", { name: "小地图" })

		fireEvent.pointerEnter(button)
		expect(screen.getByRole("tooltip")).toBeInTheDocument()

		fireEvent.click(button)
		expect(onToggle).toHaveBeenCalledOnce()
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

		fireEvent.blur(window)
		fireEvent.focus(window)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("does not show while the minimap is active", () => {
		renderMinimapButton(true)
		const button = screen.getByRole("button", { name: "小地图" })

		fireEvent.pointerEnter(button)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})

	it("closes immediately when the minimap becomes active", () => {
		const { rerender } = renderMinimapButton()
		const button = screen.getByRole("button", { name: "小地图" })

		fireEvent.pointerEnter(button)
		expect(screen.getByRole("tooltip")).toBeInTheDocument()

		rerender(
			<TooltipProvider delayDuration={0}>
				<MinimapButton active panelId="minimap-panel" onToggle={vi.fn()} />
			</TooltipProvider>,
		)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
	})
})
