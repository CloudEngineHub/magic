import type { ElementType, PropsWithChildren } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { NodeViewProps } from "@/infrastructure/editors/tiptap/react"
import { describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { TooltipProvider } from "@/components/shadcn-ui/tooltip"
import { InspectorDetailComponent } from "../component"

vi.mock("@/infrastructure/editors/tiptap/react", () => ({
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

vi.mock("@/pages/superMagic/hooks/useFileUrl", () => ({
	useFileUrl: () => ({ fileUrl: "blob:inspector-screenshot" }),
}))

describe("InspectorDetailComponent", () => {
	it("keeps the collapsed chip tall enough and separates its border from the caret", () => {
		const props = {
			node: {
				attrs: { textContent: "hello" },
			},
		} as unknown as NodeViewProps
		const { container } = render(<InspectorDetailComponent {...props} />)

		const wrapper = container.querySelector('[data-type="inspector-detail"]')
		const button = screen.getByTestId("set-expanded")

		expect(wrapper).toHaveClass(
			"!inline-flex",
			"!overflow-visible",
			"!bg-transparent",
			"relative",
			"top-[1px]",
			"!align-baseline",
		)
		expect(wrapper).toHaveAttribute("draggable", "false")
		expect(wrapper).toHaveAttribute("data-magic-editor-node")
		expect(wrapper).toHaveClass("!p-0")
		expect(wrapper).not.toHaveClass("border", "border-border/60")
		expect(button).toHaveClass(
			"h-5",
			"rounded-md",
			"border",
			"border-border/60",
			"bg-muted/30",
			"text-xs",
			"leading-5",
		)
		expect(button).toHaveTextContent("hello")
	})

	it("shows a layout-safe highlight when the inspector detail node is selected", () => {
		const props = {
			node: {
				attrs: { textContent: "hello" },
			},
			selected: true,
		} as unknown as NodeViewProps
		const { container } = render(<InspectorDetailComponent {...props} />)

		expect(container.querySelector('[data-type="inspector-detail"]')).toHaveClass(
			"select-none",
			"!outline-none",
		)
		expect(screen.getByTestId("set-expanded")).toHaveClass("border-primary/70", "bg-primary/10")
	})

	it("waits for a click before selecting so mouse drag can start", () => {
		const setNodeSelection = vi.fn()
		const props = {
			node: {
				attrs: { textContent: "hello" },
			},
			editor: { commands: { setNodeSelection } },
			getPos: () => 3,
		} as unknown as NodeViewProps
		render(<InspectorDetailComponent {...props} />)

		const button = screen.getByTestId("set-expanded")
		fireEvent.mouseDown(button, { button: 0 })
		fireEvent.dragStart(button)

		expect(setNodeSelection).not.toHaveBeenCalled()

		fireEvent.click(button)

		expect(setNodeSelection).toHaveBeenCalledWith(3)
	})

	it("renders the screenshot preview inside the expanded detail card", async () => {
		const props = {
			node: {
				attrs: {
					screenshotMention: {
						type: MentionItemType.PROJECT_FILE,
						data: {
							file_id: "screenshot-1",
							file_name: "hero.png",
							file_path: "hero.png",
							file_extension: "png",
						},
					},
				},
			},
			editor: { commands: { setNodeSelection: vi.fn() } },
			getPos: () => 3,
		} as unknown as NodeViewProps
		render(
			<TooltipProvider>
				<InspectorDetailComponent {...props} />
			</TooltipProvider>,
		)

		await act(async () => {
			screen.getByTestId("set-expanded").click()
		})
		expect(screen.getByTestId("inspector-screenshot-preview")).toBeInTheDocument()
		expect(screen.getByRole("img", { name: "hero.png" })).toHaveAttribute(
			"src",
			"blob:inspector-screenshot",
		)
	})
})
