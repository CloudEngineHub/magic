import { act, fireEvent, render, screen } from "@testing-library/react"
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import BorderSection from "../BorderSection"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		children,
	}: {
		value: string
		onValueChange: (value: string) => void
		children: ReactNode
	}) => (
		<select
			aria-label="border style"
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => children,
	SelectValue: () => null,
}))

vi.mock("../../controls", () => ({
	NumericDragInput: ({
		value,
		onChange,
		...props
	}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
		value: string
		onChange: (value: string) => void
	}) => (
		<input
			{...props}
			value={value}
			onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
		/>
	),
}))

function createSelectedElement(
	selector: string,
	borderWidth: string,
	borderStyle: string,
	borderColor: string,
	borderRadius: string,
) {
	return {
		selector,
		tagName: "div",
		computedStyles: {
			borderWidth,
			borderStyle,
			borderColor,
			borderRadius,
		},
	} as never
}

describe("BorderSection", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	it("syncs local controls when the selected element changes", () => {
		const { rerender } = render(
			<BorderSection
				selectedElement={createSelectedElement("#first", "2px", "solid", "#111111", "4px")}
				editorRef={{ current: null }}
			/>,
		)

		expect(screen.getByLabelText("stylePanel.borderWidth")).toHaveValue("2")
		expect(screen.getByLabelText("stylePanel.borderColor")).toHaveValue("#111111")
		expect(screen.getByLabelText("stylePanel.borderRadius")).toHaveValue("4")

		rerender(
			<BorderSection
				selectedElement={createSelectedElement(
					"#second",
					"5px",
					"dashed",
					"#222222",
					"8px",
				)}
				editorRef={{ current: null }}
			/>,
		)

		expect(screen.getByLabelText("stylePanel.borderWidth")).toHaveValue("5")
		expect(screen.getByLabelText("stylePanel.borderColor")).toHaveValue("#222222")
		expect(screen.getByLabelText("stylePanel.borderRadius")).toHaveValue("8")
	})

	it("syncs local controls when the same element receives refreshed styles", () => {
		const { rerender } = render(
			<BorderSection
				selectedElement={createSelectedElement("#target", "2px", "solid", "#111111", "4px")}
				editorRef={{ current: null }}
			/>,
		)

		rerender(
			<BorderSection
				selectedElement={createSelectedElement(
					"#target",
					"5px",
					"dashed",
					"#222222",
					"8px",
				)}
				editorRef={{ current: null }}
			/>,
		)

		expect(screen.getByLabelText("stylePanel.borderWidth")).toHaveValue("5")
		expect(screen.getByLabelText("stylePanel.borderColor")).toHaveValue("#222222")
		expect(screen.getByLabelText("stylePanel.borderRadius")).toHaveValue("8")
	})

	it("adds a visible default width when enabling a border style", () => {
		const onStyleChange = vi.fn()
		render(
			<BorderSection
				selectedElement={createSelectedElement("#target", "0px", "none", "#000000", "0px")}
				editorRef={{ current: null }}
				onStyleChange={onStyleChange}
			/>,
		)

		fireEvent.change(screen.getByRole("combobox", { name: "border style" }), {
			target: { value: "dashed" },
		})

		expect(onStyleChange).toHaveBeenNthCalledWith(1, "borderWidth", "1px")
		expect(onStyleChange).toHaveBeenNthCalledWith(2, "borderStyle", "dashed")
		expect(screen.getByLabelText("stylePanel.borderWidth")).toHaveValue("1")
	})

	it("enables a solid border when a positive width is entered", () => {
		const onStyleChange = vi.fn()
		render(
			<BorderSection
				selectedElement={createSelectedElement("#target", "0px", "none", "#000000", "0px")}
				editorRef={{ current: null }}
				onStyleChange={onStyleChange}
			/>,
		)

		fireEvent.change(screen.getByLabelText("stylePanel.borderWidth"), {
			target: { value: "2" },
		})

		expect(onStyleChange).toHaveBeenCalledWith("borderStyle", "solid")
		act(() => vi.advanceTimersByTime(300))
		expect(onStyleChange).toHaveBeenCalledWith("borderWidth", "2px")
	})
})
