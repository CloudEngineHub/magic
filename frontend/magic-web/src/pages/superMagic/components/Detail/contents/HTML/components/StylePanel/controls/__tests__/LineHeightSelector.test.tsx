import { act, fireEvent, render, screen } from "@testing-library/react"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { LineHeightSelector } from "../LineHeightSelector"
import { getMetricControlWidth, METRIC_CONTROL_MAX_WIDTH } from "../metricControlWidth"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/shadcn-ui/input", () => ({
	Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	...(() => {
		let handleValueChange: ((value: string) => void) | undefined
		return {
			Select: ({
				children,
				onValueChange,
			}: {
				children: ReactNode
				onValueChange?: (value: string) => void
			}) => {
				handleValueChange = onValueChange
				return <div>{children}</div>
			},
			SelectItem: ({
				children,
				value,
				...props
			}: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) => (
				<button type="button" {...props} onClick={() => handleValueChange?.(value)}>
					{children}
				</button>
			),
			SelectTrigger: () => null,
			SelectValue: () => null,
		}
	})(),
}))

vi.mock("../../../EditorFloating", () => ({
	EditorSelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

describe("LineHeightSelector", () => {
	it("localizes normal while preserving the CSS value", () => {
		const onChange = vi.fn()
		const onApply = vi.fn()
		render(<LineHeightSelector value="normal" onChange={onChange} onApply={onApply} />)

		const input = screen.getByTestId("html-editor-line-height-input")
		expect(input).toHaveValue("stylePanel.lineHeightNormal")
		fireEvent.focus(input)
		expect(input).toHaveValue("normal")
		fireEvent.blur(input)
		expect(input).toHaveValue("stylePanel.lineHeightNormal")

		onChange.mockClear()
		onApply.mockClear()
		fireEvent.click(screen.getByRole("button", { name: "stylePanel.lineHeightNormal" }))

		expect(onChange).toHaveBeenCalledWith("normal")
		expect(onApply).toHaveBeenCalledWith("normal")
	})

	it("commits values with units and restores the last value for empty input", () => {
		const onChange = vi.fn()
		const onApply = vi.fn()
		const { rerender } = render(
			<LineHeightSelector value="1.5" onChange={onChange} onApply={onApply} />,
		)

		const input = screen.getByTestId("html-editor-line-height-input")
		fireEvent.change(input, { target: { value: "24px" } })
		rerender(<LineHeightSelector value="24px" onChange={onChange} onApply={onApply} />)
		fireEvent.blur(input)
		expect(onApply).toHaveBeenCalledWith("24px")

		fireEvent.change(input, { target: { value: "" } })
		rerender(<LineHeightSelector value="" onChange={onChange} onApply={onApply} />)
		fireEvent.blur(input)
		expect(onChange).toHaveBeenLastCalledWith("24px")
		expect(onApply).toHaveBeenCalledTimes(1)
	})

	it("preserves the current unit while dragging the numeric value", () => {
		const onChange = vi.fn()
		const onApply = vi.fn()
		render(<LineHeightSelector value="121px" onChange={onChange} onApply={onApply} />)
		expect(screen.getByTestId("html-editor-line-height-control")).toHaveStyle({
			width: "124px",
			maxWidth: `${METRIC_CONTROL_MAX_WIDTH}px`,
		})

		const input = screen.getByTestId("html-editor-line-height-input")
		firePointerEvent(input, "pointerdown", 100)
		firePointerEvent(window, "pointermove", 96)
		firePointerEvent(window, "pointerup", 96)

		expect(onChange).toHaveBeenLastCalledWith("122px")
		expect(onApply).toHaveBeenCalledWith("122px")
	})

	it("caps the adaptive width for long CSS values", () => {
		expect(getMetricControlWidth("10")).toBe(104)
		expect(getMetricControlWidth("calc(100% + 200000px)")).toBe(METRIC_CONTROL_MAX_WIDTH)
	})

	it("shows the pixel equivalent for a unitless ratio and applies it on click", () => {
		const onChange = vi.fn()
		const onApply = vi.fn()
		render(
			<LineHeightSelector value="1.2" fontSize="100" onChange={onChange} onApply={onApply} />,
		)

		const equivalent = screen.getByTestId("html-editor-line-height-equivalent")
		expect(equivalent).toHaveTextContent("120px")
		fireEvent.click(equivalent)

		expect(onChange).toHaveBeenLastCalledWith("120px")
		expect(onApply).toHaveBeenCalledWith("120px")
	})

	it("shows the unitless ratio for a pixel value and applies it on click", () => {
		const onChange = vi.fn()
		const onApply = vi.fn()
		render(
			<LineHeightSelector
				value="120px"
				fontSize="100px"
				onChange={onChange}
				onApply={onApply}
			/>,
		)

		const equivalent = screen.getByTestId("html-editor-line-height-equivalent")
		expect(equivalent).toHaveTextContent("1.2")
		fireEvent.click(equivalent)

		expect(onChange).toHaveBeenLastCalledWith("1.2")
		expect(onApply).toHaveBeenCalledWith("1.2")
	})
})
