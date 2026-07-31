import { describe, expect, it, vi } from "vitest"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import { resolveTopicConversationLoadingState } from "../topic-conversation-loading"

function createUserMessage(appMessageId = "user-message", status?: string): SuperMagicMessageItem {
	return {
		type: "rich_text",
		role: "user",
		app_message_id: appMessageId,
		status,
	} as SuperMagicMessageItem
}

function createAssistantMessage(appMessageId = "assistant-message"): SuperMagicMessageItem {
	return {
		type: "agent_reply",
		role: "assistant",
		app_message_id: appMessageId,
	} as SuperMagicMessageItem
}

describe("resolveTopicConversationLoadingState", () => {
	it("marks a single sending optimistic user message as not generating", () => {
		const state = resolveTopicConversationLoadingState({
			topicMessages: [createUserMessage()],
			getMessageNode: vi.fn(),
			getOptimisticStatus: () => "sending",
		})

		expect(state.isLoading).toBe(false)
	})

	it("marks a single failed optimistic user message as not generating", () => {
		const state = resolveTopicConversationLoadingState({
			topicMessages: [createUserMessage()],
			getMessageNode: vi.fn(),
			getOptimisticStatus: () => "failed",
		})

		expect(state.isLoading).toBe(false)
	})

	it("allows a single server-acknowledged user message to wait for assistant output", () => {
		const state = resolveTopicConversationLoadingState({
			topicMessages: [createUserMessage()],
			getMessageNode: vi.fn(),
			getOptimisticStatus: () => undefined,
		})

		expect(state.isLoading).toBe(true)
	})

	it("does not keep the conversation generating when the last user message is still sending", () => {
		const getMessageNode = vi.fn(() => ({ status: "running" }))

		const state = resolveTopicConversationLoadingState({
			topicMessages: [createAssistantMessage(), createUserMessage()],
			getMessageNode,
			getOptimisticStatus: (message) => (message?.role === "user" ? "sending" : undefined),
		})

		expect(state.isLoading).toBe(false)
		expect(getMessageNode).toHaveBeenCalledWith("assistant-message")
	})

	it("does not reopen loading when the active branch ends with revoked messages", () => {
		const getMessageNode = vi.fn(() => ({ status: "running" }))

		const state = resolveTopicConversationLoadingState({
			topicMessages: [
				createAssistantMessage("old-running-assistant"),
				createUserMessage("active-revoked-user", "revoked"),
			],
			getMessageNode,
			getOptimisticStatus: () => undefined,
		})

		expect(state.isLoading).toBe(false)
		expect(state.lastMessage?.status).toBe("revoked")
	})
})
