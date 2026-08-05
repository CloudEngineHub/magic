import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
import { createTestResourceReferenceResolver } from "../../../../public/__tests__/testResourceReferenceResolver"
import SourceList from "../index"

vi.mock("../../../previews/reference-media/index", () => ({
	default: () => <div data-testid="reference-media-preview" />,
}))

function renderSourceList(ui: ReactElement) {
	return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe("SourceList selection", () => {
	it("toggles selection from both the checkbox and the whole item", () => {
		const onCheckedChange = vi.fn()

		renderSourceList(
			<SourceList
				options={[
					{
						kind: "slot",
						label: "参考图",
						value: "linked-image",
						slotIndex: 0,
						resourcePath: "/images/linked.png",
						readOnly: true,
						selection: {
							checked: false,
							ariaLabel: "参与参考媒体：linked.png",
							onCheckedChange,
						},
					},
				]}
			/>,
		)

		const checkbox = screen.getByRole("checkbox", { name: "参与参考媒体：linked.png" })
		expect(checkbox).not.toBeChecked()

		fireEvent.click(checkbox)
		fireEvent.click(checkbox.parentElement as HTMLElement)

		expect(onCheckedChange).toHaveBeenNthCalledWith(1, true)
		expect(onCheckedChange).toHaveBeenNthCalledWith(2, true)
	})

	it("does not toggle a disabled linked media checkbox", () => {
		const onCheckedChange = vi.fn()

		renderSourceList(
			<SourceList
				options={[
					{
						kind: "slot",
						label: "参考图",
						value: "disabled-linked-image",
						slotIndex: 0,
						resourcePath: "/images/linked.png",
						readOnly: true,
						selection: {
							checked: false,
							disabled: true,
							ariaLabel: "参与参考媒体：linked.png",
							onCheckedChange,
						},
					},
				]}
			/>,
		)

		const checkbox = screen.getByRole("checkbox", { name: "参与参考媒体：linked.png" })
		expect(checkbox).toBeDisabled()

		fireEvent.click(checkbox)
		fireEvent.click(checkbox.parentElement as HTMLElement)

		expect(onCheckedChange).not.toHaveBeenCalled()
	})
})

describe("SourceList preview", () => {
	it("hides preview for a resource deleted from the attachment snapshot", () => {
		const onPreviewResource = vi.fn()

		renderSourceList(
			<SourceList
				resolveResourceReference={createTestResourceReferenceResolver({
					attachmentsReady: true,
				})}
				options={[
					{
						kind: "slot",
						label: "参考图",
						value: "deleted-image",
						slotIndex: 0,
						resourcePath: "./images/deleted.png",
						previewResourceAriaLabel: "预览媒体资源",
						onPreviewResource,
					},
				]}
			/>,
		)

		expect(screen.queryByRole("button", { name: "预览媒体资源" })).not.toBeInTheDocument()
		expect(onPreviewResource).not.toHaveBeenCalled()
	})

	it("keeps preview enabled for an available resource", () => {
		const onPreviewResource = vi.fn()

		renderSourceList(
			<SourceList
				resolveResourceReference={createTestResourceReferenceResolver({
					attachmentsReady: true,
					attachmentPathsByFileId: {
						available: "/画布A/images/available.png",
					},
				})}
				options={[
					{
						kind: "slot",
						label: "参考图",
						value: "available-image",
						slotIndex: 0,
						resourcePath: "./images/available.png",
						previewResourceAriaLabel: "预览媒体资源",
						onPreviewResource,
					},
				]}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "预览媒体资源" }))
		expect(onPreviewResource).toHaveBeenCalledWith(
			expect.objectContaining({ path: "./images/available.png" }),
		)
	})
})
