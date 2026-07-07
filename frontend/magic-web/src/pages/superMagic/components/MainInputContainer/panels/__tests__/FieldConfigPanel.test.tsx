import { render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import FieldConfigPanel from "../FieldConfigPanel"
import { OptionViewType, SkillPanelType, type FieldPanelConfig } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en_US" },
	}),
}))

vi.mock("i18next", () => ({
	default: {
		language: "en_US",
		resolvedLanguage: "en_US",
		t: (key: string) => key,
	},
	t: (key: string) => key,
}))

vi.mock("../../stores", () => ({
	useOptionalSceneStateStore: () => null,
}))

function createTemplatePanelConfig(
	options: NonNullable<FieldPanelConfig["field"]>["items"][number]["options"],
	sizeDefaultValue = "",
): FieldPanelConfig {
	return {
		type: SkillPanelType.FIELD,
		title: { default: "Templates" },
		field: {
			view_type: OptionViewType.GRID,
			items: [
				{
					data_key: "template",
					label: { default: "Template" },
					option_view_type: OptionViewType.GRID,
					options,
				},
				{
					data_key: "size",
					label: { default: "Size" },
					default_value: sizeDefaultValue,
					options: [
						{
							value: "16:9",
							label: "16:9",
						},
					],
				},
			],
		},
	}
}

describe("FieldConfigPanel", () => {
	it("does not render a grid template panel when template options are empty", () => {
		const { container } = render(<FieldConfigPanel config={createTemplatePanelConfig([])} />)

		expect(container).toBeEmptyDOMElement()
	})

	it("does not render a grid template panel when every group has no templates", () => {
		const { container } = render(
			<FieldConfigPanel
				config={createTemplatePanelConfig([
					{
						group_key: "empty",
						group_name: { default: "Empty" },
						children: [],
					},
				])}
			/>,
		)

		expect(container).toBeEmptyDOMElement()
	})

	it("clears preset content when a hidden template panel has default filter values", async () => {
		const handlePresetContentChange = vi.fn()

		render(
			<FieldConfigPanel
				config={createTemplatePanelConfig([], "16:9")}
				onPresetContentChange={handlePresetContentChange}
			/>,
		)

		await waitFor(() => expect(handlePresetContentChange).toHaveBeenCalledTimes(2))
		expect(handlePresetContentChange.mock.calls).toEqual([[undefined], [undefined]])
	})
})
