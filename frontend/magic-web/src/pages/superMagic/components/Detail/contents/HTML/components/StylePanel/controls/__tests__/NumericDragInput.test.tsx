import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { NumericDragInput } from "../NumericDragInput"

function ControlledNumericInput({
	initialValue,
	onChange = vi.fn(),
	...props
}: {
	initialValue: string
	onChange?: (value: string) => void
	onCommit?: (value: string) => void
	step?: number
	min?: number
	max?: number
	precision?: number
	dragSensitivity?: number
	onPointerDown?: React.PointerEventHandler<HTMLInputElement>
}) {
	const [value, setValue] = useState(initialValue)

	return (
		<NumericDragInput
			aria-label="numeric value"
			value={value}
			onChange={(nextValue) => {
				setValue(nextValue)
				onChange(nextValue)
			}}
			{...props}
		/>
	)
}

function firePointerEvent(
	target: EventTarget,
	type: "pointerdown" | "pointermove" | "pointerup",
	clientY: number,
): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		cancelable: true,
		clientY,
	})
	act(() => target.dispatchEvent(event))
	return event
}

describe("NumericDragInput", () => {
	it("adjusts the value by vertical drag", () => {
		const onPointerDown = vi.fn()
		const onCommit = vi.fn()
		render(
			<ControlledNumericInput
				initialValue="10"
				step={2}
				dragSensitivity={4}
				onPointerDown={onPointerDown}
				onCommit={onCommit}
			/>,
		)
		const input = screen.getByRole("textbox", { name: "numeric value" })

		firePointerEvent(input, "pointerdown", 100)
		expect(onPointerDown).toHaveBeenCalled()
		expect(onPointerDown.mock.calls[0][0].button).toBe(0)
		expect(input).toHaveAttribute("data-dragging", "true")
		const moveEvent = firePointerEvent(window, "pointermove", 92)

		expect(input).toHaveValue("14")
		expect(onCommit).not.toHaveBeenCalled()
		expect(moveEvent.defaultPrevented).toBe(true)
		firePointerEvent(window, "pointermove", 84)
		expect(input).toHaveValue("18")
		expect(onCommit).not.toHaveBeenCalled()

		firePointerEvent(window, "pointerup", 84)
		expect(onCommit).toHaveBeenCalledTimes(1)
		expect(onCommit).toHaveBeenCalledWith("18")
		expect(input).not.toHaveAttribute("data-dragging", "true")
	})

	it("decreases the value when dragging down and respects min/max", () => {
		render(
			<ControlledNumericInput
				initialValue="10"
				step={2}
				dragSensitivity={4}
				min={6}
				max={12}
			/>,
		)
		const input = screen.getByRole("textbox", { name: "numeric value" })

		firePointerEvent(input, "pointerdown", 100)
		firePointerEvent(window, "pointermove", 120)
		expect(input).toHaveValue("6")

		firePointerEvent(window, "pointerup", 120)
		firePointerEvent(input, "pointerdown", 100)
		firePointerEvent(window, "pointermove", 60)
		expect(input).toHaveValue("12")
	})

	it("does not adjust by mouse wheel", () => {
		render(<ControlledNumericInput initialValue="10" step={2} />)
		const input = screen.getByRole("textbox", { name: "numeric value" })

		fireEvent.wheel(input, { deltaY: -80 })
		expect(input).toHaveValue("10")
		fireEvent.wheel(input, { deltaY: 80 })
		expect(input).toHaveValue("10")
	})

	it("adjusts with ArrowUp and ArrowDown and formats precision", () => {
		render(
			<ControlledNumericInput initialValue="0.5" step={0.1} precision={2} min={0} max={1} />,
		)
		const input = screen.getByRole("textbox", { name: "numeric value" })

		fireEvent.keyDown(input, { key: "ArrowUp" })
		expect(input).toHaveValue("0.60")
		fireEvent.keyDown(input, { key: "ArrowDown" })
		expect(input).toHaveValue("0.50")
	})

	it("keeps direct text editing and ignores drag or wheel for an invalid value", () => {
		const onChange = vi.fn()
		render(<ControlledNumericInput initialValue="" onChange={onChange} />)
		const input = screen.getByRole("textbox", { name: "numeric value" })

		firePointerEvent(input, "pointerdown", 100)
		firePointerEvent(window, "pointermove", 80)
		firePointerEvent(window, "pointerup", 80)
		fireEvent.wheel(input, { deltaY: -80 })

		expect(onChange).not.toHaveBeenCalled()

		fireEvent.change(input, { target: { value: "24" } })
		expect(input).toHaveValue("24")
		expect(onChange).toHaveBeenCalledWith("24")
	})
})
