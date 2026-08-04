import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { serializePromptRichTextLocaleValue } from "../promptRichText"
import { SkillPanelType, type OptionItem } from "../types"
import DemoPanel from "../DemoPanel"

const { publishMock } = vi.hoisted(() => ({
	publishMock: vi.fn(),
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: publishMock },
	PubSubEvents: { Set_Demo_Text_To_Input: "set-demo-text" },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "zh_CN" },
	}),
}))

vi.mock("../CollapsiblePanel", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("../TemplateGroupSelector", () => ({
	default: () => null,
}))

vi.mock("../TemplateViewSwitcher", () => ({
	default: ({
		items,
		onTemplateClick,
		selectedTemplate,
	}: {
		items: OptionItem[]
		onTemplateClick: (item: OptionItem) => void
		selectedTemplate?: OptionItem
	}) => (
		<>
			<button type="button" onClick={() => onTemplateClick(items[0])}>
				select demo
			</button>
			{selectedTemplate ? <span>selected: {selectedTemplate.label}</span> : null}
		</>
	),
}))

describe("DemoPanel", () => {
	beforeEach(() => {
		publishMock.mockReset()
	})

	it("publishes the current locale prompt without using the stable value", () => {
		const prompt = serializePromptRichTextLocaleValue({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "插入这段提示词" }],
				},
			],
		})

		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										value: "inspiration-1",
										prompt: { default: "Fallback", zh_CN: prompt },
										label: "Demo",
									},
								],
							},
						],
					},
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "select demo" }))

		expect(publishMock).toHaveBeenCalledWith("set-demo-text", "插入这段提示词")
	})

	it("falls back to description for legacy demo configs", () => {
		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										value: "legacy-id",
										description: "旧版提示词",
										label: "Legacy demo",
									},
								],
							},
						],
					},
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "select demo" }))

		expect(publishMock).toHaveBeenCalledWith("set-demo-text", "旧版提示词")
	})

	it("selects the configured default item by its stable value", () => {
		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						default_selected_template_key: "item-2",
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{ value: "item-1", prompt: "Same prompt", label: "First" },
									{ value: "item-2", prompt: "Same prompt", label: "Second" },
								],
							},
						],
					},
				}}
			/>,
		)

		expect(screen.getByText("selected: Second")).toBeInTheDocument()
	})
})
