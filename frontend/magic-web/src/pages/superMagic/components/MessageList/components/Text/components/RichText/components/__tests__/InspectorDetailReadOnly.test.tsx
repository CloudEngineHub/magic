import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { TooltipProvider } from "@/components/shadcn-ui/tooltip"
import {
	resetHtmlScreenshotTargetStore,
	setHtmlScreenshotMention,
} from "@/pages/superMagic/components/MessageEditor/services/HtmlScreenshotTargetStore"
import { InspectorDetailReadOnly } from "../InspectorDetailReadOnly"

const getStoredScreenshotBlob = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => (key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key),
	}),
}))

vi.mock("@/pages/superMagic/hooks/useFileUrl", () => ({
	useFileUrl: () => ({ fileUrl: "blob:inspector-screenshot" }),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/HtmlScreenshotUploadService", () => ({
	htmlScreenshotUploadService: { getStoredScreenshotBlob },
}))

describe("InspectorDetailReadOnly", () => {
	beforeEach(() => {
		getStoredScreenshotBlob.mockReset()
		resetHtmlScreenshotTargetStore()
	})

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
			"max-w-[min(220px,100%)]",
		)
		expect(button).toHaveClass("min-w-0")
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

	it("loads a local screenshot hover preview from targetId after send", async () => {
		getStoredScreenshotBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }))
		const createObjectURL = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:readonly-inspector-screenshot")
		const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
		setHtmlScreenshotMention("element:#hero:1", {
			type: MentionItemType.UPLOAD_FILE,
			data: {
				file_id: "storage-1",
				file_name: "html-screenshot-d8cacf53.png",
				file_path: "storage-1",
				file_extension: "png",
				is_html_screenshot: true,
				storage_id: "storage-1",
			},
		})

		render(
			<TooltipProvider>
				<InspectorDetailReadOnly
					attrs={{
						selector: "#hero",
						tagName: "section",
						size: "300 × 120 px",
						computedStyles: "{}",
						styleCount: 0,
						textContent: "全球新能源汽车市场运营指标洞察",
						targetId: "element:#hero:1",
					}}
				/>
			</TooltipProvider>,
		)

		await waitFor(() => expect(getStoredScreenshotBlob).toHaveBeenCalledWith("storage-1"))
		expect(screen.getByTestId("inspector-screenshot-preview-trigger")).toBeInTheDocument()
		createObjectURL.mockRestore()
		revokeObjectURL.mockRestore()
	})

	it("omits the live screenshot targetId from the drag payload", () => {
		const { container } = render(
			<InspectorDetailReadOnly
				attrs={{
					selector: "#hero",
					tagName: "section",
					size: "300 × 120 px",
					computedStyles: "{}",
					styleCount: 0,
					textContent: "Hero",
					targetId: "element:#hero:1",
				}}
			/>,
		)

		const node = container.querySelector("[data-magic-node-attrs]")
		expect(node).toBeTruthy()
		const attrs = JSON.parse(node?.getAttribute("data-magic-node-attrs") ?? "{}") as {
			selector?: string
			targetId?: string | null
		}
		expect(attrs.selector).toBe("#hero")
		expect(attrs.targetId).toBeNull()
	})
})
