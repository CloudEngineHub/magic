import { render, screen } from "@testing-library/react"
import type { ChangeEvent, ComponentProps, InputHTMLAttributes, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import BoxModelSection from "../BoxModelSection"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../../controls", () => ({
	DimensionInput: ({ label, value, id }: { label: string; value: string; id?: string }) => (
		<label>
			{label}
			<input id={id} value={value} readOnly />
		</label>
	),
	NumericDragInput: ({
		value,
		onChange,
		hideStepper: _hideStepper,
		...props
	}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
		value: string | number
		onChange: (value: string) => void
		hideStepper?: boolean
	}) => (
		<input
			{...props}
			value={value}
			onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
		/>
	),
}))

function createSelectedElement(
	width = "1920px",
	height = "1080px",
): ComponentProps<typeof BoxModelSection>["selectedElement"] {
	return {
		selector: ".slide",
		tagName: "div",
		computedStyles: {
			width,
			height,
			margin: "0px",
			padding: "0px",
			borderWidth: "0px",
		},
	} as never
}

function renderSection(ui: ReactNode) {
	return render(ui)
}

describe("BoxModelSection", () => {
	it("centers used-pixel dimensions in the content box", () => {
		renderSection(
			<BoxModelSection
				selectedElement={createSelectedElement()}
				editorRef={{ current: null }}
			/>,
		)

		const content = screen.getByTestId("html-style-panel-box-model-content")
		expect(content.textContent).toContain("1920px")
		expect(content.textContent).toContain("1080px")
		expect(content.className).toContain("items-center")
		expect(content.className).toContain("justify-center")
		expect(content.className).toContain("w-full")
	})

	it("keeps box-model edge fields inside their grid rows", () => {
		renderSection(
			<BoxModelSection
				selectedElement={createSelectedElement()}
				editorRef={{ current: null }}
			/>,
		)

		const edge = screen.getAllByTestId("box-model-edge-stylePanel.boxModelSideLabel")[0]
		expect(edge.closest(".grid")?.className).toContain(
			"grid-rows-[1.25rem_minmax(2rem,auto)_1.25rem]",
		)
		expect(edge.className).toContain("h-5")
		expect(edge.className).toContain("ring-0")
	})
})
