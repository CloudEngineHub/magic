import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PendingTargetsPanel } from "../PendingTargetsPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("PendingTargetsPanel", () => {
	it("keeps the fixed bar visible and disables submit without confirmed targets", () => {
		const onSelectionModeChange = vi.fn()
		const { rerender } = render(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				onSelectionModeChange={onSelectionModeChange}
				onExit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("element-inspector-pending-panel")).toBeInTheDocument()
		expect(screen.getByTestId("element-inspector-submit-button")).toBeDisabled()
		const elementModeButton = screen.getByRole("button", {
			name: "stylePanel.inspector.elementMode",
		})
		const screenshotModeButton = screen.getByRole("button", {
			name: "stylePanel.inspector.screenshotMode",
		})
		expect(
			screen.getByRole("group", { name: "stylePanel.inspector.selectionMode" }),
		).toBeInTheDocument()
		expect(elementModeButton).toHaveAttribute("aria-pressed", "true")
		expect(elementModeButton).toHaveClass("bg-primary", "text-primary-foreground")
		expect(screenshotModeButton).toHaveAttribute("aria-pressed", "false")
		expect(screenshotModeButton).not.toHaveClass("bg-primary")

		fireEvent.click(screenshotModeButton)
		expect(onSelectionModeChange).toHaveBeenCalledWith("screenshot")

		rerender(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				selectionMode="screenshot"
				onSelectionModeChange={onSelectionModeChange}
				onExit={vi.fn()}
			/>,
		)
		expect(
			screen.getByRole("button", { name: "stylePanel.inspector.screenshotMode" }),
		).toHaveClass("bg-primary", "text-primary-foreground")
	})

	it("shows a loading submit button while the request is processing", () => {
		render(
			<PendingTargetsPanel
				targets={[
					{
						id: "#hero",
						kind: "element",
						info: {
							selector: "#hero",
							tagName: "section",
							id: "hero",
							classList: [],
							rect: { top: 0, left: 0, width: 100, height: 80 },
							margin: { top: 0, right: 0, bottom: 0, left: 0 },
							padding: { top: 0, right: 0, bottom: 0, left: 0 },
							border: { top: 0, right: 0, bottom: 0, left: 0 },
							computedStyles: {},
							attributes: {},
							textContent: "",
						},
						instruction: "Update hero",
					},
				]}
				submitState="submitting"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				onExit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("element-inspector-submit-button")).toBeDisabled()
		expect(screen.getByTestId("element-inspector-submit-button")).toContainHTML("svg")
	})

	it("keeps the pending panel above a bottom toolbar when an inset is provided", () => {
		render(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				bottomOffset={72}
			/>,
		)

		expect(screen.getByTestId("element-inspector-pending-panel")).toHaveStyle({
			bottom: "72px",
		})
	})
})
