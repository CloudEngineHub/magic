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
				"detail.aiCard.notification.channels.wecom": "WeCom",
				"detail.aiCard.notification.channels.lark": "Lark",
				"detail.aiCard.notification.placeholders.dingtalk": "e.g. Send to Ops Daily group",
				"detail.aiCard.notification.placeholders.wecom": "e.g. Send to WeCom Ops group",
				"detail.aiCard.notification.placeholders.lark": "e.g. Send to Growth Daily group",
				"detail.aiCard.notification.templates.dingtalkGroup": "Send to Ops Daily group",
				"detail.aiCard.notification.templates.dingtalkUser": "Send to someone",
				"detail.aiCard.notification.templates.wecomGroup": "Send to WeCom Ops group",
				"detail.aiCard.notification.templates.wecomUser": "Send to someone",
				"detail.aiCard.notification.templates.larkGroup": "Send to Growth Daily group",
				"detail.aiCard.notification.templates.larkUser": "Send to someone",
				"detail.aiCard.notification.templateValues.user": "Send to:",
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

	it("emits wecom notification target descriptions", () => {
		const onChange = vi.fn()

		render(<AICardNotificationFields value={{ channels: [] }} onChange={onChange} />)

		fireEvent.click(screen.getByRole("checkbox", { name: /WeCom/ }))

		expect(onChange).toHaveBeenLastCalledWith({
			channels: [{ channel: "wecom", targetDescription: "" }],
		})
	})

	it("uses a user target prefix when clicking a person template", () => {
		const onChange = vi.fn()

		render(
			<AICardNotificationFields
				value={{ channels: [{ channel: "lark", targetDescription: "" }] }}
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Send to someone" }))

		expect(onChange).toHaveBeenLastCalledWith({
			channels: [{ channel: "lark", targetDescription: "Send to:" }],
		})
	})
})
