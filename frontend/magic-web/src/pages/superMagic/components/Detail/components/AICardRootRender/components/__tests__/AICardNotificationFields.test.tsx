import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import AICardNotificationFields from "../AICardNotificationFields"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"detail.aiCard.notification.title": "Notification channels",
				"detail.aiCard.notification.description":
					"Send update notices after card generation.",
				"detail.aiCard.notification.channels.dingtalk": "DingTalk",
				"detail.aiCard.notification.channels.lark": "Lark",
				"detail.aiCard.notification.placeholders.dingtalk": "e.g. Send to Ops Daily group",
				"detail.aiCard.notification.placeholders.lark": "e.g. Send to Growth Daily group",
				"detail.aiCard.notification.templates.dingtalkGroup": "Send to Ops Daily group",
				"detail.aiCard.notification.templates.dingtalkUser": "Send to Zhang San",
				"detail.aiCard.notification.templates.larkGroup": "Send to Growth Daily group",
				"detail.aiCard.notification.templates.larkUser": "Send to Li Si",
			})[key] ?? key,
	}),
}))

describe("AICardNotificationFields", () => {
	it("emits only channel and target description for selected notification channels", () => {
		const onChange = vi.fn()

		render(<AICardNotificationFields value={{ channels: [] }} onChange={onChange} />)

		fireEvent.click(screen.getByRole("checkbox", { name: /DingTalk/ }))

		expect(onChange).toHaveBeenLastCalledWith({
			channels: [{ channel: "dingtalk", targetDescription: "" }],
		})
	})

	it("updates the selected channel target description", () => {
		const onChange = vi.fn()

		render(
			<AICardNotificationFields
				value={{ channels: [{ channel: "lark", targetDescription: "" }] }}
				onChange={onChange}
			/>,
		)

		fireEvent.change(screen.getByPlaceholderText("e.g. Send to Growth Daily group"), {
			target: { value: "Send to Growth team daily group" },
		})

		expect(onChange).toHaveBeenLastCalledWith({
			channels: [{ channel: "lark", targetDescription: "Send to Growth team daily group" }],
		})
	})
})
