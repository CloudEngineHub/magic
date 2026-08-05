import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "../../../primitives/shadcn/tooltip"
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
