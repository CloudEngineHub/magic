import type { ElementType, PropsWithChildren } from "react"
import { act, render, screen } from "@testing-library/react"
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
