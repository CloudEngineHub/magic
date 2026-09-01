import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { InspectorDetailReadOnly } from "../InspectorDetailReadOnly"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key),
	}),
}))

vi.mock("@/pages/superMagic/hooks/useFileUrl", () => ({
	useFileUrl: () => ({ fileUrl: "blob:inspector-screenshot" }),
}))

describe("InspectorDetailReadOnly", () => {
	it("uses the selected element text as the header label", () => {
		render(
			<InspectorDetailReadOnly
				attrs={{
					selector: "div.map-axis-y",
					tagName: "div",
					size: "32 × 128 px",
					computedStyles: "{}",
					styleCount: 0,
					textContent: "增长压力",
				}}
			/>,
		)

		expect(screen.getByTestId("set-expanded")).toHaveTextContent("增长压力")
		expect(screen.getByTestId("set-expanded")).not.toHaveTextContent("已选取的元素")
	})

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
			"relative",
			"top-[1px]",
			"!align-baseline",
		)
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
	})

	it("renders the screenshot preview in the expanded read-only card", async () => {
		render(
			<InspectorDetailReadOnly
				attrs={{
					selector: "#hero",
					tagName: "section",
					size: "300 × 120 px",
					computedStyles: "{}",
					styleCount: 0,
					textContent: "Hero",
					screenshotMention: {
						type: MentionItemType.PROJECT_FILE,
						data: {
							file_id: "screenshot-1",
							file_name: "hero.png",
							file_path: "hero.png",
							file_extension: "png",
						},
					},
				}}
			/>,
		)

		await act(async () => {
			screen.getByTestId("set-expanded").click()
		})
		expect(screen.getByTestId("inspector-screenshot-preview")).toBeInTheDocument()
	})
})
