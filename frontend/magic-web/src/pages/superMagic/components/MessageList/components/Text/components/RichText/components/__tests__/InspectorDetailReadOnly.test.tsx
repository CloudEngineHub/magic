import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { InspectorDetailReadOnly } from "../InspectorDetailReadOnly"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key),
	}),
}))

describe("InspectorDetailReadOnly", () => {
	it("matches the collapsed editor chip height and inline alignment", () => {
		const { container } = render(
			<InspectorDetailReadOnly
				attrs={{
					selector: "",
					tagName: "div",
					size: "",
					computedStyles: "{}",
					styleCount: 0,
					textContent: "",
				}}
			/>,
		)

		const wrapper = container.querySelector(".inspector-detail-read-only")
		const button = screen.getByTestId("set-expanded")

		expect(wrapper).toHaveClass(
			"!inline-flex",
			"!overflow-visible",
			"!bg-transparent",
			"!p-0",
			"!align-middle",
		)
		expect(wrapper).not.toHaveClass("border", "border-border/60")
		expect(button).toHaveClass("h-6", "rounded-md", "border", "border-border/60", "bg-muted/30")
	})
})
