import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ControlHandles } from "../ControlHandles"

const sharedProps = {
	isMoving: false,
	onMoveHandleMouseDown: vi.fn(),
	onDuplicate: vi.fn(),
	onDelete: vi.fn(),
	onResizeHandleMouseDown: vi.fn(),
	rotation: 0,
	onRotateHandleMouseDown: vi.fn(),
	transformedRect: { top: 0, left: 0, width: 120, height: 80 },
	containerElement: null,
}

describe("ControlHandles", () => {
	it("renders gap ticks only when frames are provided", () => {
		const { rerender } = render(
			<ControlHandles
				{...sharedProps}
				resizeHandles={[]}
				gapHandles={[]}
				onGapHandlePointerDown={vi.fn()}
			/>,
		)
		expect(screen.queryByTestId("on-gap-handle-pointer-down")).not.toBeInTheDocument()
		rerender(
			<ControlHandles
				{...sharedProps}
				resizeHandles={[]}
				gapHandles={[
					{
						axis: "column",
						left: 40,
						top: 10,
						width: 8,
						height: 60,
						cursor: "col-resize",
					},
				]}
				onGapHandlePointerDown={vi.fn()}
			/>,
		)
		expect(screen.getByTestId("on-gap-handle-pointer-down")).toHaveAttribute(
			"data-axis",
			"column",
		)
	})
})
