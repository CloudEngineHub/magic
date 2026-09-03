import { renderHook, act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PubSubEvents } from "@/utils/pubsub"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { useIframeAgentActions } from "../useIframeAgentActions"

const mocks = vi.hoisted(() => ({
	publish: vi.fn(),
	createTopic: vi.fn(),
	getTopicDetail: vi.fn(),
	setSelectedTopic: vi.fn(),
	setScopedTopics: vi.fn(),
	setScopedSelectedTopic: vi.fn(),
	dispatchMessage: vi.fn(),
	hasListeners: vi.fn(() => false),
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: mocks.publish,
		hasListeners: mocks.hasListeners,
	},
	PubSubEvents: {
		Send_Message_by_Content: "send-message-by-content",
	},
}))

vi.mock("@/pages/superMagic/pages/Workspace/types", () => ({
	AgentType: {
		Official: 1,
		Custom: 2,
		Public: 3,
	},
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		_modeList: [
			{
				agent: { type: 1 },
				mode: { identifier: TopicMode.General, name: "General" },
			},
		],
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createTopic: mocks.createTopic,
		getTopicDetail: mocks.getTopicDetail,
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: { id: "project-1" },
	},
	topicStore: {
		setSelectedTopic: mocks.setSelectedTopic,
	},
}))

vi.mock("@/services/superMagic/topicModel", () => ({
	superMagicTopicModelService: {
		saveModel: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/messageSendFlowService", () => ({
	messageSendService: {
		dispatchMessage: mocks.dispatchMessage,
	},
}))

vi.mock("@/pages/superMagic/services/messageSendPreparation", () => ({
	resolveMessageSendContext: (context: unknown) => context,
	processMessageMentions: async (content: unknown) => content,
}))

describe("useIframeAgentActions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.createTopic.mockResolvedValue({ id: "topic-1" })
		mocks.getTopicDetail.mockImplementation(async ({ id }: { id: string }) => ({
			id,
			chat_topic_id: `chat-${id}`,
			chat_conversation_id: `conversation-${id}`,
		}))
		mocks.dispatchMessage.mockResolvedValue(true)
		mocks.hasListeners.mockReturnValue(false)
	})

	it("does not publish a General topicMode when agentId is omitted", async () => {
		const { result } = renderHook(() => useIframeAgentActions())

		await act(async () => {
			await result.current.createTopicAndSend({ message: "hello" })
		})

		expect(mocks.publish).toHaveBeenCalledWith(
			PubSubEvents.Send_Message_by_Content,
			expect.not.objectContaining({
				topicMode: TopicMode.General,
			}),
		)
		expect(mocks.setSelectedTopic).toHaveBeenCalledWith({ id: "topic-1" })
	})

	it("uses the explicit projectId for topic creation", async () => {
		const { result } = renderHook(() => useIframeAgentActions("project-from-preview"))

		await act(async () => {
			await result.current.createTopicAndSend({ message: "hello" })
		})

		expect(mocks.createTopic).toHaveBeenCalledWith({
			project_id: "project-from-preview",
			topic_name: "",
		})
	})

	it("updates the scoped topic store after creating a topic", async () => {
		let topics = [{ id: "old-topic" }] as Topic[]
		let selectedTopic: Topic | null = topics[0] ?? null
		const scopedTopicStore = {
			get topics() {
				return topics
			},
			get selectedTopic() {
				return selectedTopic
			},
			setTopics(nextTopics: Topic[]) {
				topics = nextTopics
				mocks.setScopedTopics(nextTopics)
			},
			setSelectedTopic(nextTopic: Topic | null) {
				selectedTopic = nextTopic
				mocks.setScopedSelectedTopic(nextTopic)
			},
		} as unknown as TopicStore
		const { result } = renderHook(() =>
			useIframeAgentActions("project-from-preview", scopedTopicStore, {
				id: "project-from-preview",
			} as any),
		)

		await act(async () => {
			await result.current.createTopicAndSend({ message: "hello" })
		})

		expect(mocks.setScopedSelectedTopic).toHaveBeenCalledWith(
			expect.objectContaining({ id: "topic-1" }),
		)
		expect(mocks.setScopedTopics).toHaveBeenCalledWith([
			expect.objectContaining({ id: "topic-1" }),
			{ id: "old-topic" },
		])
		expect(mocks.dispatchMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					extra: expect.objectContaining({
						super_agent: expect.objectContaining({
							topic_pattern: TopicMode.MicroApp,
						}),
					}),
				}),
				context: expect.objectContaining({
					selectedTopic: expect.objectContaining({ id: "topic-1" }),
				}),
			}),
		)
		expect(mocks.publish).not.toHaveBeenCalled()
		expect(mocks.setSelectedTopic).not.toHaveBeenCalled()
	})

	it("binds concurrent sends to the topic created for each message", async () => {
		const createdTopics = [{ id: "topic-1" }, { id: "topic-2" }, { id: "topic-3" }]
		let createIndex = 0
		let selectedTopic: Topic | null = null
		const scopedTopicStore = {
			topics: [],
			get selectedTopic() {
				return selectedTopic
			},
			setTopics: mocks.setScopedTopics,
			setSelectedTopic(topic: Topic | null) {
				selectedTopic = topic
			},
		} as unknown as TopicStore
		mocks.createTopic.mockImplementation(async () => createdTopics[createIndex++])

		const { result } = renderHook(() =>
			useIframeAgentActions("project-from-preview", scopedTopicStore, {
				id: "project-from-preview",
			} as any),
		)

		await act(async () => {
			await Promise.all(
				createdTopics.map((_, index) =>
					result.current.createTopicAndSend({ message: `message-${index + 1}` }),
				),
			)
		})

		expect(mocks.dispatchMessage).toHaveBeenCalledTimes(3)
		expect(
			mocks.dispatchMessage.mock.calls.map(([payload]) => payload.context.selectedTopic?.id),
		).toEqual(["topic-1", "topic-2", "topic-3"])
	})

	it("bypasses the mounted editor lock for concurrent scoped sends", async () => {
		const createdTopics = [{ id: "topic-1" }, { id: "topic-2" }, { id: "topic-3" }]
		let createIndex = 0
		let selectedTopic: Topic | null = null
		let editorBusy = false
		const scopedTopicStore = {
			topics: [],
			get selectedTopic() {
				return selectedTopic
			},
			setTopics: mocks.setScopedTopics,
			setSelectedTopic(topic: Topic | null) {
				selectedTopic = topic
			},
		} as unknown as TopicStore
		mocks.createTopic.mockImplementation(async () => createdTopics[createIndex++])
		mocks.hasListeners.mockReturnValue(true)
		mocks.publish.mockImplementation((_event, payload) => {
			if (editorBusy) return
			editorBusy = true
			void mocks.dispatchMessage({
				context: { selectedTopic: payload.targetTopic },
			})
		})

		const { result } = renderHook(() =>
			useIframeAgentActions("project-from-preview", scopedTopicStore, {
				id: "project-from-preview",
			} as any),
		)

		await act(async () => {
			await Promise.all(
				createdTopics.map((_, index) =>
					result.current.createTopicAndSend({ message: `message-${index + 1}` }),
				),
			)
		})

		expect(mocks.dispatchMessage).toHaveBeenCalledTimes(3)
		expect(
			mocks.dispatchMessage.mock.calls.map(([payload]) => payload.context.selectedTopic?.id),
		).toEqual(["topic-1", "topic-2", "topic-3"])
		expect(mocks.publish).not.toHaveBeenCalled()
	})

	it("uses the scoped direct path when the message editor is mounted", async () => {
		mocks.hasListeners.mockReturnValue(true)
		const scopedTopicStore = {
			topics: [],
			setTopics: mocks.setScopedTopics,
			setSelectedTopic: mocks.setScopedSelectedTopic,
		} as any
		const { result } = renderHook(() =>
			useIframeAgentActions("project-from-preview", scopedTopicStore, {
				id: "project-from-preview",
			} as any),
		)

		await act(async () => {
			await result.current.createTopicAndSend({ message: "hello" })
		})

		expect(mocks.dispatchMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				context: expect.objectContaining({
					selectedTopic: expect.objectContaining({ id: "topic-1" }),
				}),
			}),
		)
		expect(mocks.publish).not.toHaveBeenCalled()
	})
})
