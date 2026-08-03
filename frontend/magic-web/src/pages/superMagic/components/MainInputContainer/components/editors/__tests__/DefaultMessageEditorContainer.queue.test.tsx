import { forwardRef } from "react"
import { act, render } from "@testing-library/react"
import type { JSONContent } from "@tiptap/core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

const mocks = vi.hoisted(() => ({
	addToQueue: vi.fn(),
	handleSend: undefined as
		| ((params: {
				value: JSONContent
				mentionItems: []
				topicMode: TopicMode
		  }) => Promise<boolean>)
		| undefined,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/MessageEditor", () => ({
	default: forwardRef(() => null),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "zh_CN" },
	}),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	roleStore: {
		currentRole: TopicMode.Default,
		setCurrentRole: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: { selectedProject: null },
	topicStore: { selectedTopic: null, topics: [] },
	workspaceStore: { selectedWorkspace: null, firstWorkspace: null },
}))

vi.mock("@/pages/superMagic/hooks/useSharedProjectMode", () => ({
	default: vi.fn(),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: { getModePlaceholderWithLegacy: () => "" },
}))

vi.mock("@/pages/superMagic/components/MessagePanel/hooks/useSandboxPreWarm", () => ({
	default: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useOfficialPromptsPayload", () => ({
	useOfficialPromptsPayload: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useTopicExamplesPortal", () => ({
	default: () => null,
}))

vi.mock("@/components/business/MentionPanel/builtin-store", () => ({
	default: {},
}))

vi.mock("../../../stores", () => ({
	useOptionalSceneStateStore: () => null,
}))

vi.mock("@/pages/superMagic/services/messageSendFlowService", () => ({
	createMessageSendService: () => ({ sendPanelMessage: vi.fn() }),
}))

vi.mock("@/pages/superMagic/services/messageSendPreparation", () => ({
	createTopicForMessageContext: vi.fn(),
	ensureProjectForMessageContext: vi.fn(),
	preparePanelSend: vi.fn(),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils", () => ({
	generateTextFromJSONContent: () => "queued message",
}))

import DefaultMessageEditorContainer from "../DefaultMessageEditorContainer"

describe("DefaultMessageEditorContainer queue sending", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.handleSend = undefined
		mocks.addToQueue.mockResolvedValue("queue-1")
	})

	it.each([
		["微应用", TopicMode.MicroApp],
		["Skill 编辑", TopicMode.SkillCreator],
		["员工编辑", TopicMode.CrewCreator],
		["员工对话", TopicMode.CustomAgent],
		["MagiClaw", TopicMode.MagiClaw],
	])("%s 任务运行中加入队列时也应用 mergeSendParams", async (_scene, mergedTopicMode) => {
		render(
			<DefaultMessageEditorContainer
				editorContext={{
					selectedProject: { id: "project-1" } as never,
					selectedTopic: { id: "topic-1" } as never,
					topicMode: TopicMode.Default,
					showLoading: true,
					mergeSendParams: ({ defaultParams }) => ({
						...defaultParams,
						topicMode: mergedTopicMode,
					}),
					queueContext: {
						editingQueueItem: null,
						addToQueue: mocks.addToQueue,
						finishEditQueueItem: vi.fn(),
					},
					onMessageSendReady: (sendMessage) => {
						mocks.handleSend = sendMessage as typeof mocks.handleSend
					},
				}}
			/>,
		)

		const value: JSONContent = {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "你好" }] }],
		}

		await act(async () => {
			await mocks.handleSend?.({
				value,
				mentionItems: [],
				topicMode: TopicMode.Default,
			})
		})

		expect(mocks.addToQueue).toHaveBeenCalledWith(
			expect.objectContaining({ topicMode: mergedTopicMode }),
		)
	})

	it("only passes queue-supported fields after merging send params", async () => {
		render(
			<DefaultMessageEditorContainer
				editorContext={{
					selectedProject: { id: "project-1" } as never,
					selectedTopic: { id: "topic-1" } as never,
					topicMode: TopicMode.Default,
					showLoading: true,
					mergeSendParams: ({ defaultParams }) => ({
						...defaultParams,
						topicMode: TopicMode.MicroApp,
						extra: { micro_app_id: "app-1" },
						queueId: "send-only-queue-id",
						throwOnError: true,
					}),
					queueContext: {
						editingQueueItem: null,
						addToQueue: mocks.addToQueue,
						finishEditQueueItem: vi.fn(),
					},
					onMessageSendReady: (sendMessage) => {
						mocks.handleSend = sendMessage as typeof mocks.handleSend
					},
				}}
			/>,
		)

		const value: JSONContent = {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "你好" }] }],
		}

		await act(async () => {
			await mocks.handleSend?.({
				value,
				mentionItems: [],
				topicMode: TopicMode.Default,
			})
		})

		expect(mocks.addToQueue).toHaveBeenCalledWith({
			content: value,
			mentionItems: [],
			selectedModel: undefined,
			selectedImageModel: undefined,
			selectedVideoModel: undefined,
			topicMode: TopicMode.MicroApp,
		})
	})
})
