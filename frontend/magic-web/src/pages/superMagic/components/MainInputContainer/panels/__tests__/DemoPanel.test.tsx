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
	}: {
		items: unknown[]
		onTemplateClick: (item: unknown) => void
	}) => (
		<button type="button" onClick={() => onTemplateClick(items[0])}>
			select demo
		</button>
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
})
