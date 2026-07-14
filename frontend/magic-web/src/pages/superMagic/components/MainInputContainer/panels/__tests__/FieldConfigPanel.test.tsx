import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"
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
					options: [{ value: "16:9", label: "16:9" }],
				},
			],
		},
	}
}

function createMixedHeaderPanelConfig(): FieldPanelConfig {
	return {
		type: SkillPanelType.FIELD,
		title: { default: "Template" },
		expandable: true,
		default_expanded: true,
		field: {
			view_type: OptionViewType.GRID,
			items: [
				{
					data_key: "template",
					label: { default: "Template" },
					option_view_type: OptionViewType.GRID,
					options: [
						{
							group_key: "mock-group",
							group_name: { default: "Mock Group" },
							children: [
								{
									value: "template-alpha",
									label: "Template Alpha",
									thumbnail_url: "/mock-template-alpha.png",
								},
							],
						},
					],
				},
				{
					data_key: "pages",
					label: { default: "Pages" },
					placeholder: { default: "Auto" },
					options: [
						{ value: "5-8", label: "5-8" },
						{ value: "8-12", label: "8-12" },
					],
				},
				{
					data_key: "language",
					label: { default: "Language" },
					placeholder: { default: "Auto" },
					options: [
						{ value: "mock-zh", label: "Mock Chinese" },
						{ value: "mock-en", label: "Mock English" },
					],
				},
			],
		},
	}
}

async function loadFieldConfigPanel() {
	return (await import("../FieldConfigPanel")).default
}

async function renderMixedHeaderPanel() {
	const FieldConfigPanel = await loadFieldConfigPanel()
	return render(
		<FieldConfigPanel
			config={createMixedHeaderPanelConfig()}
			variant={ScenePanelVariant.HomePage}
		/>,
	)
}

describe("FieldConfigPanel", () => {
	it("does not render a grid template panel when template options are empty", async () => {
		const FieldConfigPanel = await loadFieldConfigPanel()
		const { container } = render(<FieldConfigPanel config={createTemplatePanelConfig([])} />)

		expect(container).toBeEmptyDOMElement()
	})

	it("does not render a grid template panel when every group has no templates", async () => {
		const FieldConfigPanel = await loadFieldConfigPanel()
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
		const FieldConfigPanel = await loadFieldConfigPanel()
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

	it("keeps the template panel expanded when clicking a header filter select", async () => {
		await renderMixedHeaderPanel()

		expect(await screen.findByText("Template Alpha")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("combobox", { name: "Pages" }))
		expect(screen.getByText("Template Alpha")).toBeInTheDocument()
	})

	it("keeps the template header itself as the collapsible trigger", async () => {
		await renderMixedHeaderPanel()

		expect(await screen.findByText("Template Alpha")).toBeInTheDocument()
		fireEvent.click(screen.getByText("Template"))
		expect(screen.queryByText("Template Alpha")).not.toBeInTheDocument()
		fireEvent.click(screen.getByText("Template"))
		expect(await screen.findByText("Template Alpha")).toBeInTheDocument()
	})
})
