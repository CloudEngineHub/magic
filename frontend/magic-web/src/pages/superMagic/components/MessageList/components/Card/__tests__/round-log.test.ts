import { describe, expect, it } from "vitest"
import { getCurrentConversationRound } from "../round-log"

describe("getCurrentConversationRound", () => {
	it("returns one user message and all messages until the next user turn", () => {
		const messages = [
			{ app_message_id: "user-1", role: "user", seq_id: "1" },
			{ app_message_id: "assistant-1", role: "assistant", seq_id: "2" },
			{ app_message_id: "tool-1", role: "tool", seq_id: "3" },
			{ app_message_id: "assistant-2", role: "assistant", seq_id: "4" },
			{ app_message_id: "user-2", role: "user", seq_id: "5" },
			{ app_message_id: "assistant-3", role: "assistant", seq_id: "6" },
		]

		expect(getCurrentConversationRound(messages, "assistant-1")).toEqual(messages.slice(0, 4))
	})

	it("returns an empty list when the clicked message is not in the topic", () => {
		expect(
			getCurrentConversationRound(
				[{ app_message_id: "user-1", role: "user" }],
				"missing-message",
			),
		).toEqual([])
	})
})
