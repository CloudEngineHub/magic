import { describe, expect, it } from "vitest"
import { compactAICardNotification, normalizeAICardNotification } from "../aiCardNotification"

describe("aiCardNotification", () => {
	it("keeps only supported channels and their target descriptions", () => {
		const notification = normalizeAICardNotification({
			channels: [
				{ channel: "dingtalk", targetDescription: "发到运营日报群" },
				{ channel: "wechat", targetDescription: "发到微信群" },
				{ channel: "lark", targetDescription: "发到增长日报群" },
			],
		} as unknown as Parameters<typeof normalizeAICardNotification>[0])

		expect(notification).toEqual({
			channels: [
				{ channel: "dingtalk", targetDescription: "发到运营日报群" },
				{ channel: "lark", targetDescription: "发到增长日报群" },
			],
		})
	})

	it("drops channels with empty target descriptions before persisting", () => {
		expect(
			compactAICardNotification({
				channels: [
					{ channel: "dingtalk", targetDescription: "  " },
					{ channel: "lark", targetDescription: " 发到增长日报群 " },
				],
			}),
		).toEqual({
			channels: [{ channel: "lark", targetDescription: "发到增长日报群" }],
		})
	})
})
