import type { ElementType, PropsWithChildren } from "react"
import { render, screen } from "@testing-library/react"
import type { NodeViewProps } from "@tiptap/react"
import { describe, expect, it, vi } from "vitest"
import { InspectorDetailComponent } from "../component"

vi.mock("@tiptap/react", () => ({
	NodeViewWrapper: ({
		as: Component = "div",
		children,
		...props
	}: PropsWithChildren<{ as?: ElementType }>) => {
		const Wrapper = Component
		return <Wrapper {...props}>{children}</Wrapper>
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key),
	}),
}))

describe("InspectorDetailComponent", () => {
	it("keeps the collapsed chip tall enough and separates its border from the caret", () => {
		const props = {
			node: {
				attrs: {},
			},
		} as unknown as NodeViewProps
		const { container } = render(<InspectorDetailComponent {...props} />)

		const wrapper = container.querySelector('[data-type="inspector-detail"]')
		const button = screen.getByTestId("set-expanded")

		expect(wrapper).toHaveClass("!inline-flex", "!overflow-visible", "!bg-transparent")
		expect(wrapper).toHaveClass("!py-0", "!pl-0", "!pr-1")
		expect(wrapper).not.toHaveClass("border", "border-border/60")
		expect(button).toHaveClass("h-6", "rounded-md", "border", "border-border/60", "bg-muted/30")
	})
})
