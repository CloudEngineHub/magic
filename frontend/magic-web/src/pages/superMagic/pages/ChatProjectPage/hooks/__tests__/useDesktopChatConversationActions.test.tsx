import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MessageStatus } from "@/pages/superMagic/pages/Workspace/types"

const messagesMap = vi.hoisted(() => new Map<string, Array<{ status?: string }>>())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useDesktopChatProjectActions", () => ({
	useDesktopChatProjectActions: () => ({
		projectActions: [
			{ key: "pinProject", label: "chat.pinChat", onClick: vi.fn() },
			{ key: "rename", label: "chat.renameChat", onClick: vi.fn() },
			{ key: "saveAsProject", label: "chat.saveAsProject", onClick: vi.fn() },
			{ key: "delete", label: "chat.deleteChat", onClick: vi.fn(), variant: "danger" },
		],
		projectActionMap: new Map(),
		projectActionComponents: null,
		updateCurrentActionItem: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/Share/Modal", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		get messages() {
			return messagesMap
		},
	},
}))

import { useDesktopChatConversationActions } from "../useDesktopChatConversationActions"

const selectedProject = {
	id: "project-1",
	workspace_id: "chat-workspace-1",
	project_name: "Alpha",
} as never

const selectedTopic = {
	id: "topic-1",
	chat_topic_id: "chat-topic-1",
	project_id: "project-1",
	topic_name: "Alpha",
} as never

describe("useDesktopChatConversationActions", () => {
	it("disables share when the conversation has no shareable messages", () => {
		messagesMap.clear()

		const { result } = renderHook(() =>
			useDesktopChatConversationActions({
				selectedProject,
				selectedTopic,
			}),
		)

		const shareAction = result.current.conversationActionGroups[0]?.actions[0]
		expect(shareAction?.key).toBe("share-topic")
		expect(shareAction?.disabled).toBe(true)
	})

	it("enables share when the conversation has messages before REVOKED", () => {
		messagesMap.clear()
		messagesMap.set("chat-topic-1", [{ status: "finished" }])

		const { result } = renderHook(() =>
			useDesktopChatConversationActions({
				selectedProject,
				selectedTopic,
			}),
		)

		const shareAction = result.current.conversationActionGroups[0]?.actions[0]
		expect(shareAction?.disabled).toBe(false)
	})

	it("keeps share disabled when only REVOKED messages exist", () => {
		messagesMap.clear()
		messagesMap.set("chat-topic-1", [{ status: MessageStatus.REVOKED }])

		const { result } = renderHook(() =>
			useDesktopChatConversationActions({
				selectedProject,
				selectedTopic,
			}),
		)

		const shareAction = result.current.conversationActionGroups[0]?.actions[0]
		expect(shareAction?.disabled).toBe(true)
	})

	it.each([
		{
			label: "历史撤回后已有普通消息",
			messages: [{ status: MessageStatus.REVOKED }, { status: "finished" }],
		},
		{
			label: "普通消息后存在当前撤回段",
			messages: [
				{ status: "finished" },
				{ status: MessageStatus.REVOKED },
				{ status: MessageStatus.REVOKED },
			],
		},
		{
			label: "历史撤回和当前撤回段同时存在",
			messages: [
				{ status: MessageStatus.REVOKED },
				{ status: "finished" },
				{ status: MessageStatus.REVOKED },
			],
		},
	])("enables share when $label", ({ messages }) => {
		messagesMap.clear()
		messagesMap.set("chat-topic-1", messages)

		const { result } = renderHook(() =>
			useDesktopChatConversationActions({
				selectedProject,
				selectedTopic,
			}),
		)

		const shareAction = result.current.conversationActionGroups[0]?.actions[0]
		expect(shareAction?.disabled).toBe(false)
	})

	it("includes the pin action ahead of rename/save-as/delete actions", () => {
		messagesMap.clear()
		messagesMap.set("chat-topic-1", [{ status: "finished" }])

		const { result } = renderHook(() =>
			useDesktopChatConversationActions({
				selectedProject,
				selectedTopic,
			}),
		)

		const actionKeys = result.current.conversationActionGroups
			.flatMap((group) => group.actions)
			.map((action) => action.key)

		expect(actionKeys).toContain("pinProject")
		expect(actionKeys.indexOf("pinProject")).toBeLessThan(actionKeys.indexOf("rename"))
	})
})
