import { beforeEach, describe, expect, it, vi } from "vitest"

const { getMessageNodeMock, messagesMock } = vi.hoisted(() => ({
	getMessageNodeMock: vi.fn(),
	messagesMock: new Map<string, Array<Record<string, unknown>>>(),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: getMessageNodeMock,
		messages: messagesMock,
	},
}))

import { resolveTaskId } from "../model"

describe("resolveTaskId", () => {
	beforeEach(() => {
		messagesMock.clear()
		getMessageNodeMock.mockReset()
	})

	it("uses the assistant canonical super_message_id", () => {
		messagesMock.set("topic-1", [
			{
				app_message_id: "assistant-app-message-1",
				super_message_id: "assistant-super-message-1",
			},
		])
		getMessageNodeMock.mockImplementation((messageId?: string) => {
			if (messageId !== "assistant-super-message-1") return undefined
			return {
				task_id: "task-1",
				tool_calls: [{ id: "plan-1" }],
			}
		})

		expect(resolveTaskId("topic-1", "plan-1")).toBe("task-1")
	})

	it("falls back to legacy app_message_id messages", () => {
		messagesMock.set("topic-1", [
			{
				app_message_id: "legacy-assistant-message-1",
			},
		])
		getMessageNodeMock.mockImplementation((messageId?: string) => {
			if (messageId !== "legacy-assistant-message-1") return undefined
			return {
				task_id: "legacy-task-1",
				tool_calls: [{ id: "legacy-plan-1" }],
			}
		})

		expect(resolveTaskId("topic-1", "legacy-plan-1")).toBe("legacy-task-1")
	})
})
