import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import LinkedFrameAssignmentPopover from "../LinkedFrameAssignmentPopover"

function renderPopover(options?: {
	startSelected?: boolean
	endSelected?: boolean
	endDisabled?: boolean
}) {
	const onToggleRole = vi.fn()
	render(
		<LinkedFrameAssignmentPopover
			options={[
				{
					role: "start",
					label: "设为首帧",
					selected: options?.startSelected ?? false,
				},
				{
					role: "end",
					label: "设为尾帧",
					selected: options?.endSelected ?? false,
					disabled: options?.endDisabled,
				},
			]}
			className="linked-frame-item"
			style={{}}
			content={<span>关联图片 A</span>}
			onToggleRole={onToggleRole}
		/>,
	)
	return onToggleRole
}

describe("LinkedFrameAssignmentPopover", () => {
	it("assigns a linked image to the selected frame role", () => {
		const onToggleRole = renderPopover()

		fireEvent.click(screen.getByText("关联图片 A"))
		fireEvent.click(screen.getByRole("button", { name: "设为首帧" }))

		expect(onToggleRole).toHaveBeenCalledWith("start", false)
	})

	it("supports assigning the end frame role", () => {
		const onToggleRole = renderPopover()

		fireEvent.click(screen.getByText("关联图片 A"))
		fireEvent.click(screen.getByRole("button", { name: "设为尾帧" }))

		expect(onToggleRole).toHaveBeenCalledWith("end", false)
	})

	it("marks assigned roles and toggles them off", () => {
		const onToggleRole = renderPopover({ startSelected: true })

		fireEvent.click(screen.getByText("关联图片 A"))
		const startButton = screen.getByRole("button", { name: "设为首帧" })
		expect(startButton).toHaveAttribute("aria-pressed", "true")

		fireEvent.click(startButton)
		expect(onToggleRole).toHaveBeenCalledWith("start", true)
	})

	it("does not toggle disabled roles", () => {
		const onToggleRole = renderPopover({ endDisabled: true })

		fireEvent.click(screen.getByText("关联图片 A"))
		const endButton = screen.getByRole("button", { name: "设为尾帧" })
		expect(endButton).toBeDisabled()

		fireEvent.click(endButton)
		expect(onToggleRole).not.toHaveBeenCalled()
	})
})
