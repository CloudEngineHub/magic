import { describe, expect, it, vi } from "vitest"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { createMessageSendService } from "@/pages/superMagic/services/messageSendFlowService"

// This unit owns outbound request construction only; isolate UI/router/store singletons so the
// assertion exercises MessageSendService's real option merge without unrelated application boot.
vi.mock("@/apis", () => ({ ChatApi: {}, SuperMagicApi: {} }))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: { user_id: "default-user" } } },
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		messages: new Map(),
		getLatestMessageAnchor: vi.fn(() => ({})),
		addUserMessage: vi.fn(),
		replaceUserMessage: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		markSending: vi.fn(),
		markFailed: vi.fn(),
		confirm: vi.fn(),
		clearActiveRevokedAnchor: vi.fn(),
	},
}))

vi.mock("@/components/business/MentionPanel/builtin-store", () => ({
	default: { addMentionListItemsToHistory: vi.fn() },
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils", () => ({
	buildPlainTextJSONContent: (text: string) => ({
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	}),
	generateTextFromJSONContent: () => "hello",
	isEmptyJSONContent: () => false,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils/mention", () => ({
	transformMentions: (mentions: unknown[]) => mentions,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/InternetSearchManager", () => ({
	DEFAULT_KEY: "default",
	internetSearchManager: {
		getIsChecked: vi.fn(() => true),
		setIsChecked: vi.fn(),
	},
}))

vi.mock("@/utils/log", () => ({
	logger: { createLogger: () => ({ error: vi.fn() }) },
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn() },
	PubSubEvents: { Refresh_Topic_Messages: "Refresh_Topic_Messages" },
}))

vi.mock("@/pages/superMagic/services/topicRename", () => ({
	smartRenameTopicIfUnnamed: vi.fn(async () => null),
}))

vi.mock("@/pages/superMagic/services/chatConversationNameSync", () => ({
	shouldSyncChatConversationName: vi.fn(() => false),
	syncChatProjectNameOnly: vi.fn(),
}))

vi.mock("@/services/recordSummary/NetworkMonitor", () => ({
	getNetworkMonitor: () => ({ isNetworkOffline: () => false }),
}))

type MessageSendService = ReturnType<typeof createMessageSendService>
type MessageSendServiceDeps = Parameters<MessageSendService["configure"]>[0]

describe("MessageSendService / SuperMagic 单候选请求", () => {
	it.each([
		["调用方传入 n=4", { n: 4, caller_flag: "preserved" }],
		["调用方未传 n", { caller_flag: "preserved" }],
	] as const)(
		"发送 Agent 消息时强制 dynamic_params.n=1：%s。",
		async (_caseName, dynamicParams) => {
			const chat = vi.fn().mockResolvedValue({})
			const addUserMessage = vi.fn()
			const service = createMessageSendService({
				chatApi: { chat } as unknown as MessageSendServiceDeps["chatApi"],
				superMagicApi: {} as MessageSendServiceDeps["superMagicApi"],
				pubsub: { publish: vi.fn() } as unknown as MessageSendServiceDeps["pubsub"],
				mentionPanelStore: {
					addMentionListItemsToHistory: vi.fn(),
				} as unknown as MessageSendServiceDeps["mentionPanelStore"],
				userStore: {
					user: { userInfo: { user_id: "user-1" } },
				} as MessageSendServiceDeps["userStore"],
				superMagicStore: {
					messages: new Map([["chat-topic-1", []]]),
					getLatestMessageAnchor: vi.fn(() => ({})),
					addUserMessage,
					replaceUserMessage: vi.fn(),
				} as unknown as MessageSendServiceDeps["superMagicStore"],
				logger: { error: vi.fn() } as unknown as MessageSendServiceDeps["logger"],
			})
			const selectedTopic = {
				id: "topic-1",
				chat_topic_id: "chat-topic-1",
				chat_conversation_id: "conversation-1",
			} as Topic

			const sent = await service.dispatchMessage({
				content: "hello",
				showLoading: false,
				selectedProject: null,
				selectedTopic,
				options: {
					extra: {
						super_agent: {
							mentions: [],
							chat_mode: "normal",
							dynamic_params: { ...dynamicParams },
						},
					},
				},
			})

			expect(sent).toBe(true)
			expect(addUserMessage).toHaveBeenCalledTimes(1)
			expect(chat).toHaveBeenCalledTimes(1)
			const pendingUserMessage = chat.mock.calls[0]?.[1] as {
				message?: {
					rich_text?: {
						extra?: { super_agent?: { dynamic_params?: Record<string, unknown> } }
					}
				}
			}
			expect(
				pendingUserMessage.message?.rich_text?.extra?.super_agent?.dynamic_params,
			).toEqual(
				expect.objectContaining({
					message_version: "v2",
					n: 1,
					caller_flag: "preserved",
				}),
			)
		},
	)
})
