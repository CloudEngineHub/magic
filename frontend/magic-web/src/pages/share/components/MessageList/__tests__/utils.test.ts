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
				status: "read",
				raw_content: {
					super_magic_message: {
						role: "assistant",
						topic_id: "shared-topic-1",
						correlation_id: "shared-correlation-1",
						content: "shared content",
						status: "finished",
					},
				},
			},
		])

		expect(message).toMatchObject({
			app_message_id: "shared-assistant-1",
			topic_id: "shared-topic-1",
			role: "assistant",
			imStatus: "read",
			superStatus: "finished",
		})
	})

	it.each([
		{
			messageId: "shared-user-without-super-id",
			expectedSuperMessageId: "shared-user-without-super-id",
			expectedContent: "shared user content",
			message: {
				message_id: "shared-user-without-super-id",
				type: "rich_text",
				role: "user",
				content: "shared user content",
			},
		},
		{
			messageId: "shared-assistant-without-super-id",
			expectedSuperMessageId: "shared-assistant-without-super-id",
			expectedContent: "shared assistant content",
			message: {
				message_id: "shared-assistant-without-super-id",
				type: "super_magic_message",
				raw_content: {
					super_magic_message: {
						role: "assistant",
						content: "shared assistant content",
					},
				},
			},
		},
		{
			messageId: "shared-assistant-envelope-id",
			expectedSuperMessageId: "shared-assistant-super-id",
			expectedContent: "shared assistant with canonical id",
			message: {
				message_id: "shared-assistant-envelope-id",
				type: "super_magic_message",
				raw_content: {
					super_magic_message: {
						role: "assistant",
						super_message_id: "shared-assistant-super-id",
						content: "shared assistant with canonical id",
					},
				},
			},
		},
		{
			messageId: "shared-user-envelope-id",
			expectedSuperMessageId: "shared-user-app-id",
			expectedContent: "shared user with canonical id",
			message: {
				message_id: "shared-user-envelope-id",
				type: "super_magic_message",
				raw_content: {
					super_magic_message: {
						role: "user",
						app_message_id: "shared-user-app-id",
						super_message_id: "ignored-user-super-id",
						content: "shared user with canonical id",
					},
				},
			},
		},
	])(
		"分享消息暴露与 Store 一致的 canonical identity：$messageId",
		({ expectedSuperMessageId, expectedContent, message: sharedMessage }) => {
			const [message] = messagesTransformer([sharedMessage])

			expect(message.super_message_id).toBe(expectedSuperMessageId)
			expect(superMagicStore.getMessageNode(message.super_message_id)).toMatchObject({
				content: expectedContent,
			})
		},
	)
})
