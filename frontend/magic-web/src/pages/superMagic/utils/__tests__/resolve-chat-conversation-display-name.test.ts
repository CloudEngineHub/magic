import { describe, expect, it, vi } from "vitest"
import {
	resolveChatConversationDisplayName,
	resolveMessageHeaderEditableTitle,
	resolveMessageHeaderTitle,
	shouldUseChatConversationDisplayName,
} from "../resolve-chat-conversation-display-name"

const chatWorkspaceId = "chat-workspace-mock-1"

vi.mock("@/pages/superMagic/utils/isChatWorkspaceProject", () => ({
	isCachedChatWorkspaceProject: (project?: { workspace_id?: string } | null) =>
		project?.workspace_id === chatWorkspaceId,
}))

const t = (key: string) => {
	const labels: Record<string, string> = {
		"chat.unnamedChat": "未命名对话",
		"messageHeader.untitledTopic": "未命名话题",
	}
	return labels[key] ?? key
}

describe("resolve-chat-conversation-display-name", () => {
	it("shouldUseChatConversationDisplayName returns true for chat workspace projects", () => {
		expect(shouldUseChatConversationDisplayName({ workspace_id: chatWorkspaceId })).toBe(true)
		expect(shouldUseChatConversationDisplayName({ workspace_id: "other-workspace" })).toBe(false)
	})

	it("resolveChatConversationDisplayName prefers topic then project then unnamed fallback", () => {
		expect(
			resolveChatConversationDisplayName({
				topic: { topic_name: "  Topic A  " },
				project: { workspace_id: chatWorkspaceId, project_name: "Project B" },
				t: t as never,
			}),
		).toBe("Topic A")

		expect(
			resolveChatConversationDisplayName({
				topic: { topic_name: "" },
				project: { workspace_id: chatWorkspaceId, project_name: " Project B " },
				t: t as never,
			}),
		).toBe("Project B")

		expect(
			resolveChatConversationDisplayName({
				topic: { topic_name: "" },
				project: { workspace_id: chatWorkspaceId, project_name: "" },
				t: t as never,
			}),
		).toBe("未命名对话")
	})

	it("resolveChatConversationDisplayName can omit fallback for rename inputs", () => {
		expect(
			resolveChatConversationDisplayName({
				topic: { topic_name: "" },
				project: { workspace_id: chatWorkspaceId, project_name: "" },
				t: t as never,
				includeFallback: false,
			}),
		).toBe("")
	})

	it("resolveMessageHeaderTitle uses chat naming for chat workspace projects", () => {
		expect(
			resolveMessageHeaderTitle({
				topic: { topic_name: "" },
				project: { workspace_id: chatWorkspaceId, project_name: "" },
				t: t as never,
			}),
		).toBe("未命名对话")
	})

	it("resolveMessageHeaderTitle keeps untitled topic fallback for regular projects", () => {
		expect(
			resolveMessageHeaderTitle({
				topic: { topic_name: "" },
				project: { workspace_id: "regular-workspace", project_name: "Project B" },
				t: t as never,
			}),
		).toBe("未命名话题")
	})

	it("resolveMessageHeaderEditableTitle returns raw names without i18n placeholder", () => {
		expect(
			resolveMessageHeaderEditableTitle({
				topic: { topic_name: "" },
				project: { workspace_id: chatWorkspaceId, project_name: "" },
				t: t as never,
			}),
		).toBe("")
	})
})
