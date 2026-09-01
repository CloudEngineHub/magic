import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
		expect(screen.getByTestId("element-inspector-pending-panel")).toHaveClass("t-panel-slide")
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
		expect(elementModeButton).not.toHaveClass("hover:bg-accent", "hover:text-accent-foreground")
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
		expect(
			screen.getByRole("button", { name: "stylePanel.inspector.screenshotMode" }),
		).not.toHaveClass("hover:bg-accent", "hover:text-accent-foreground")
	})

	it("reveals the collection bar after its first paint", async () => {
		render(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("element-inspector-pending-panel")).toHaveAttribute(
				"data-open",
				"true",
			)
		})
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

	it("hides screenshot mode when capture is unsupported", () => {
		render(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				screenshotSupported={false}
			/>,
		)

		expect(
			screen.queryByRole("button", { name: "stylePanel.inspector.screenshotMode" }),
		).not.toBeInTheDocument()
	})

	it("keeps the target list collapsed until the compact panel is hovered", () => {
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
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		const toggle = screen.getByTestId("element-inspector-pending-target-toggle")
		const panel = screen.getByTestId("element-inspector-pending-panel")
		const getTargetList = () => screen.queryByTestId("element-inspector-pending-target-list")

		expect(toggle).toHaveAttribute("aria-expanded", "false")
		expect(getTargetList()).not.toBeInTheDocument()

		fireEvent.mouseEnter(panel)
		expect(toggle).toHaveAttribute("aria-expanded", "true")
		expect(getTargetList()).toHaveAttribute("data-placement", "bottom")

		fireEvent.mouseLeave(panel)
		expect(toggle).toHaveAttribute("aria-expanded", "false")
		expect(getTargetList()).not.toBeInTheDocument()
	})

	it("opens the target list upward when the panel is near the bottom edge", () => {
		render(
			<PendingTargetsPanel
				topOffset={700}
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
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		const panel = screen.getByTestId("element-inspector-pending-panel")
		fireEvent.mouseEnter(panel)

		expect(screen.getByTestId("element-inspector-pending-target-list")).toHaveAttribute(
			"data-placement",
			"top",
		)
		expect(screen.getByTestId("element-inspector-pending-panel")).toHaveClass(
			"overflow-visible",
		)
	})

	it("expands the target list while keyboard focus stays inside the panel", () => {
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
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
			/>,
		)

		const toggle = screen.getByTestId("element-inspector-pending-target-toggle")
		fireEvent.focus(toggle)

		expect(toggle).toHaveAttribute("aria-expanded", "true")
		expect(screen.getByTestId("element-inspector-pending-target-list")).toBeInTheDocument()
	})

	it("starts at the top-right and can be dragged as a single surface", () => {
		render(
			<PendingTargetsPanel
				targets={[]}
				submitState="idle"
				onEdit={vi.fn()}
				onRemove={vi.fn()}
				onSubmit={vi.fn()}
				topOffset={72}
			/>,
		)

		const panel = screen.getByTestId("element-inspector-pending-panel")
		expect(panel).toHaveStyle({ top: "72px", right: "16px" })
		fireEvent.pointerDown(panel, { button: 0, pointerId: 1, clientX: 300, clientY: 80 })
		expect(panel).toHaveAttribute("data-dragging", "true")
		fireEvent.pointerMove(panel, { pointerId: 1, clientX: 350, clientY: 120 })
		expect(panel).toHaveAttribute("data-dragging", "true")
		fireEvent.pointerUp(panel, { pointerId: 1, clientX: 350, clientY: 120 })
		expect(panel).toHaveAttribute("data-dragging", "false")
	})
})
