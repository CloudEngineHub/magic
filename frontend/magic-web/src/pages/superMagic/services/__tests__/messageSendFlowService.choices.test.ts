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
	it("adds the text Mention backend label while preserving structured content", async () => {
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
				user: { userInfo: { user_id: "mock-user" } },
			} as unknown as MessageSendServiceDeps["userStore"],
			superMagicStore: {
				messages: new Map([["mock-chat-topic", []]]),
				getLatestMessageAnchor: vi.fn(() => ({})),
				addUserMessage,
				replaceUserMessage: vi.fn(),
			} as unknown as MessageSendServiceDeps["superMagicStore"],
			logger: { error: vi.fn() } as unknown as MessageSendServiceDeps["logger"],
		})
		const selectedTopic = {
			id: "mock-topic",
			chat_topic_id: "mock-chat-topic",
			chat_conversation_id: "mock-conversation",
		} as Topic
		const structuredContent = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "请查看 " },
						{
							type: "mention",
							attrs: {
								id: null,
								label: null,
								mentionSuggestionChar: "@",
								type: "text",
								data: {
									id: "mock-text-001",
									label: "模拟图表",
									text: "图表id: mock-chart-001;时间范围：模拟区间",
								},
							},
						},
					],
				},
			],
		}

		await service.dispatchMessage({
			jsonContent: structuredContent,
			showLoading: false,
			selectedProject: null,
			selectedTopic,
			options: { extra: { super_agent: { mentions: [] } } },
		})

		const displayed = addUserMessage.mock.calls[0]?.[1]?.message?.rich_text?.content
		const transported = chat.mock.calls[0]?.[1]?.message?.rich_text?.content
		const expectedContent = {
			...structuredContent,
			content: [
				{
					...structuredContent.content[0],
					content: [
						structuredContent.content[0].content[0],
						{
							...structuredContent.content[0].content[1],
							attrs: {
								...structuredContent.content[0].content[1].attrs,
								label: "图表id: mock-chart-001;时间范围：模拟区间",
							},
						},
					],
				},
			],
		}
		expect(JSON.parse(displayed)).toEqual(expectedContent)
		expect(JSON.parse(transported)).toEqual(expectedContent)
		expect(structuredContent.content[0].content[1].attrs.label).toBeNull()
	})

	it.each([
		["调用方传入 n=4", { n: 4, caller_flag: "preserved" }],
		["调用方未传 n", { caller_flag: "preserved" }],
	] as const)(
		"发送 Agent 消息时保留调用方 dynamic_params：%s。",
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
					caller_flag: "preserved",
				}),
			)
		},
	)

	it("marks a previously finished topic as running before dispatching the Agent request", async () => {
		const chat = vi.fn().mockResolvedValue({
			data: {
				seq: {
					message: { app_message_id: "server-user-message" },
				},
			},
		})
		const beginTopicExecution = vi.fn()
		const mergeTopic = vi.fn()
		const service = createMessageSendService({
			chatApi: { chat } as unknown as MessageSendServiceDeps["chatApi"],
			superMagicApi: {} as MessageSendServiceDeps["superMagicApi"],
			pubsub: { publish: vi.fn() } as unknown as MessageSendServiceDeps["pubsub"],
			mentionPanelStore: {
				addMentionListItemsToHistory: vi.fn(),
			} as unknown as MessageSendServiceDeps["mentionPanelStore"],
			userStore: {
				user: { userInfo: { user_id: "mock-user" } },
			} as unknown as MessageSendServiceDeps["userStore"],
			superMagicStore: {
				messages: new Map([["mock-chat-topic", []]]),
				getLatestMessageAnchor: vi.fn(() => ({})),
				addUserMessage: vi.fn(),
				replaceUserMessage: vi.fn(),
				beginTopicExecution,
			} as unknown as MessageSendServiceDeps["superMagicStore"],
			logger: { error: vi.fn() } as unknown as MessageSendServiceDeps["logger"],
		})

		await service.dispatchMessage({
			content: "hello",
			showLoading: false,
			selectedProject: null,
			selectedTopic: {
				id: "topic-1",
				chat_topic_id: "mock-chat-topic",
				chat_conversation_id: "mock-conversation",
				task_status: "finished",
			} as Topic,
			context: {
				topicStore: { mergeTopic } as never,
			},
		})

		expect(beginTopicExecution).toHaveBeenCalledWith("mock-chat-topic")
		expect(mergeTopic).toHaveBeenCalledWith("topic-1", {
			task_status: "running",
			status: "running",
		})
		expect(chat).toHaveBeenCalledTimes(1)
	})

	it("restores the previous Topic status when the Agent request fails", async () => {
		const chat = vi.fn().mockRejectedValue(new Error("request failed"))
		const beginTopicExecution = vi.fn()
		const failPendingTopicExecution = vi.fn()
		const mergeTopic = vi.fn()
		const service = createMessageSendService({
			chatApi: { chat } as unknown as MessageSendServiceDeps["chatApi"],
			superMagicApi: {} as unknown as MessageSendServiceDeps["superMagicApi"],
			pubsub: { publish: vi.fn() } as unknown as MessageSendServiceDeps["pubsub"],
			mentionPanelStore: {
				addMentionListItemsToHistory: vi.fn(),
			} as unknown as MessageSendServiceDeps["mentionPanelStore"],
			userStore: {
				user: { userInfo: { user_id: "mock-user" } },
			} as unknown as MessageSendServiceDeps["userStore"],
			superMagicStore: {
				messages: new Map([["mock-chat-topic", []]]),
				getLatestMessageAnchor: vi.fn(() => ({})),
				addUserMessage: vi.fn(),
				replaceUserMessage: vi.fn(),
				beginTopicExecution,
				failPendingTopicExecution,
			} as unknown as MessageSendServiceDeps["superMagicStore"],
			logger: { error: vi.fn() } as unknown as MessageSendServiceDeps["logger"],
		})

		const sent = await service.dispatchMessage({
			content: "hello",
			showLoading: false,
			selectedProject: null,
			selectedTopic: {
				id: "topic-1",
				chat_topic_id: "mock-chat-topic",
				chat_conversation_id: "mock-conversation",
				task_status: "finished",
			} as Topic,
			context: {
				topicStore: { mergeTopic } as never,
			},
		})

		await vi.waitFor(() =>
			expect(failPendingTopicExecution).toHaveBeenCalledWith("mock-chat-topic"),
		)
		expect(sent).toBe(true)
		expect(mergeTopic).toHaveBeenLastCalledWith("topic-1", {
			task_status: "finished",
			status: "finished",
		})
	})
})
