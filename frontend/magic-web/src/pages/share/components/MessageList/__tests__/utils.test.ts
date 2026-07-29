import { beforeEach, describe, expect, it } from "vitest"
import { superMagicStore } from "@/pages/superMagic/stores"
import { messagesTransformer } from "../utils"

describe("share MessageList messagesTransformer", () => {
	beforeEach(() => {
		superMagicStore.messageMap.clear()
		superMagicStore.toolResponseMap.clear()
	})

	it("顶层 topic_id 缺失时使用 SuperMagic raw node 的 topic_id。", () => {
		const [message] = messagesTransformer([
			{
				message_id: "shared-assistant-1",
				type: "super_magic_message",
				raw_content: {
					super_magic_message: {
						role: "assistant",
						topic_id: "shared-topic-1",
						correlation_id: "shared-correlation-1",
						content: "shared content",
					},
				},
			},
		])

		expect(message).toMatchObject({
			app_message_id: "shared-assistant-1",
			topic_id: "shared-topic-1",
			role: "assistant",
		})
	})
})
