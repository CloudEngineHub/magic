import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { serializePromptRichTextLocaleValue } from "../promptRichText"
import { SkillPanelType } from "../types"
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
		items: unknown[]
		onTemplateClick: (item: unknown) => void
		selectedTemplate?: { label?: string }
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

	it("publishes the current locale prompt as plain text", () => {
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
										value: { default: "Fallback", zh_CN: prompt },
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

	it("selects the configured default demo by its persistent item key", () => {
		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						default_selected_template_key: "item-second",
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										item_key: "item-first",
										value: "Same prompt",
										label: "First",
									},
									{
										item_key: "item-second",
										value: "Same prompt",
										label: "Second",
									},
								],
							},
						],
					},
				}}
			/>,
		)

		expect(screen.getByText("selected: Second")).toBeInTheDocument()
	})

	it("prioritizes a persistent item key over another item's legacy value", () => {
		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						default_selected_template_key: "item-second",
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										item_key: "item-first",
										value: "item-second",
										label: "First",
									},
									{
										item_key: "item-second",
										value: "Second prompt",
										label: "Second",
									},
								],
							},
						],
					},
				}}
			/>,
		)

		expect(screen.getByText("selected: Second")).toBeInTheDocument()
	})

	it("does not reinterpret a schema v2 prompt as the default item key", () => {
		render(
			<DemoPanel
				config={{
					schema_version: 2,
					type: SkillPanelType.DEMO,
					demo: {
						default_selected_template_key: "Second prompt",
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										item_key: "item-second",
										value: "Second prompt",
										label: "Second",
									},
								],
							},
						],
					},
				}}
			/>,
		)

		expect(screen.queryByText("selected: Second")).not.toBeInTheDocument()
	})

	it("keeps compatibility with a default key stored in another locale", () => {
		render(
			<DemoPanel
				config={{
					type: SkillPanelType.DEMO,
					demo: {
						default_selected_template_key: "第二个提示词",
						groups: [
							{
								group_key: "default",
								group_name: "Default",
								children: [
									{
										value: { default: "First prompt", zh_CN: "第一个提示词" },
										label: "First",
									},
									{
										value: { default: "Second prompt", zh_CN: "第二个提示词" },
										label: "Second",
									},
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
