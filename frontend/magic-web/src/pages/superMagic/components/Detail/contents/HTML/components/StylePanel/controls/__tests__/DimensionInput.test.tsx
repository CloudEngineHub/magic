import { act, fireEvent, render, screen } from "@testing-library/react"
import { forwardRef, type InputHTMLAttributes } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DimensionInput } from "../DimensionInput"

vi.mock("@/components/shadcn-ui/input", () => ({
	/** Use a plain input so the test can focus on px-only behavior. */
	Input: forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
		<input ref={ref} {...props} />
	)),
}))

vi.mock("@/components/shadcn-ui/label", () => ({
	/** Keep the label lightweight for jsdom tests. */
	Label: ({
		children,
		htmlFor,
		className,
	}: {
		children: React.ReactNode
		htmlFor?: string
		className?: string
	}) => (
		<label htmlFor={htmlFor} className={className}>
			{children}
		</label>
	),
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	/** Keep the select minimal so tests can focus on unit preservation behavior. */
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode
		onValueChange?: (value: string) => void
	}) => (
		<div data-testid="dimension-input-unit-select" data-on-change={Boolean(onValueChange)}>
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({
		children,
		value,
		"data-testid": dataTestId,
	}: {
		children: React.ReactNode
		value: string
		"data-testid"?: string
	}) => (
		<button type="button" data-testid={dataTestId} data-value={value}>
			{children}
		</button>
	),
	SelectTrigger: ({
		children,
		"data-testid": dataTestId,
	}: {
		children: React.ReactNode
		"data-testid"?: string
	}) => <button data-testid={dataTestId}>{children}</button>,
	SelectValue: () => <span />,
}))

function firePointerEvent(
	target: EventTarget,
	type: "pointerdown" | "pointermove" | "pointerup",
	clientY: number,
) {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		cancelable: true,
		clientY,
	})
	act(() => target.dispatchEvent(event))
}

describe("DimensionInput", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	it("hides the px unit and treats a bare number as pixels", () => {
		const handleChange = vi.fn()

		render(
			<DimensionInput
				label="Width"
				value="200px"
				onChange={handleChange}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		expect(screen.getByTestId("dimension-input-input")).toHaveValue("200")
		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()

		fireEvent.change(screen.getByTestId("dimension-input-input"), {
			target: { value: "240" },
		})
		vi.advanceTimersByTime(300)

		expect(handleChange).toHaveBeenCalledWith("240px")
		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()
	})

	it("shows a non-px unit and keeps it when the user types that unit", () => {
		const handleChange = vi.fn()

		render(
			<DimensionInput
				label="Width"
				value="50%"
				onChange={handleChange}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		expect(screen.getByTestId("dimension-input-input")).toHaveValue("50")
		expect(screen.getByTestId("dimension-input-unit-trigger")).toBeInTheDocument()

		fireEvent.change(screen.getByTestId("dimension-input-input"), {
			target: { value: "60%" },
		})
		vi.advanceTimersByTime(300)

		expect(handleChange).toHaveBeenCalledWith("60%")
		expect(screen.getByTestId("dimension-input-unit-trigger")).toBeInTheDocument()
	})

	it("converts a number-only edit to px even when the previous unit was not px", () => {
		const handleChange = vi.fn()

		render(
			<DimensionInput
				label="Width"
				value="50%"
				onChange={handleChange}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		fireEvent.change(screen.getByTestId("dimension-input-input"), {
			target: { value: "60" },
		})
		vi.advanceTimersByTime(300)

		expect(handleChange).toHaveBeenCalledWith("60px")
		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()
	})

	it("converts a dragged value to px", () => {
		const handleChange = vi.fn()

		render(
			<DimensionInput
				label="Width"
				value="50%"
				onChange={handleChange}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)
		const input = screen.getByTestId("dimension-input-input")

		firePointerEvent(input, "pointerdown", 100)
		firePointerEvent(window, "pointermove", 96)
		firePointerEvent(window, "pointerup", 96)
		vi.advanceTimersByTime(300)

		expect(handleChange).toHaveBeenCalledWith("51px")
		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()
	})

	it("should hide the unit selector and append px automatically when px-only mode is enabled", () => {
		const handleChange = vi.fn()

		render(
			<DimensionInput
				label="Width"
				value="200px"
				onChange={handleChange}
				id="width"
				testIdPrefix="dimension-input"
				fixedUnit="px"
			/>,
		)

		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()

		fireEvent.change(screen.getByTestId("dimension-input-input"), {
			target: { value: "240" },
		})
		vi.advanceTimersByTime(300)

		expect(handleChange).toHaveBeenCalledWith("240px")
	})

	it("should sync the displayed number and unit when the external value changes", () => {
		const { rerender } = render(
			<DimensionInput
				label="Width"
				value="200px"
				onChange={vi.fn()}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()

		rerender(
			<DimensionInput
				label="Width"
				value="50%"
				onChange={vi.fn()}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		expect(screen.getByTestId("dimension-input-input")).toHaveValue("50")
		expect(screen.getByTestId("dimension-input-unit-trigger")).toBeInTheDocument()

		rerender(
			<DimensionInput
				label="Width"
				value="400px"
				onChange={vi.fn()}
				id="width"
				testIdPrefix="dimension-input"
			/>,
		)

		expect(screen.getByTestId("dimension-input-input")).toHaveValue("400")
		expect(screen.queryByTestId("dimension-input-unit-trigger")).not.toBeInTheDocument()
	})
})
