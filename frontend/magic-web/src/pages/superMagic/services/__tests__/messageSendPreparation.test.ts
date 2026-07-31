import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import {
	ensureProjectForMessageContext,
	preparePanelSend,
} from "@/pages/superMagic/services/messageSendPreparation"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

vi.mock("@/apis", () => ({
	SuperMagicApi: {},
}))

vi.mock("@/components/Agent/MCP/service/MCPStorageService", () => ({
	ProjectStorage: class {
		async getMCP() {
			return []
		}

		async saveMCP() {
			return undefined
		}
	},
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/MentionItemsProcessor", () => ({
	mentionItemsProcessor: {
		processMentionItems: vi.fn(async (content, mentionItems) => ({ content, mentionItems })),
	},
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getLastWorkDir: vi.fn(() => undefined),
	},
}))

vi.mock("@/services/superMagic/topicModel", () => ({
	DEFAULT_TOPIC_ID: "default-topic",
	superMagicTopicModelCacheService: {
		getTopicModel: vi.fn(async () => null),
	},
	superMagicTopicModelService: {},
}))

const { modeServiceMock, isModeValidMock, isModeVisibleMock } = vi.hoisted(() => {
	const isModeValid = vi.fn(() => false)
	const isModeVisible = vi.fn(() => true)
	return {
		modeServiceMock: {
			defaultAgentCode: undefined as string | undefined,
			isModeValid,
			isModeVisible,
		},
		isModeValidMock: isModeValid,
		isModeVisibleMock: isModeVisible,
	}
})

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: modeServiceMock,
}))

vi.mock("@/pages/superMagic/services/topicService", () => ({
	default: class {},
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		handleCreateTopic: vi.fn(),
		project: {
			renameProject: vi.fn(),
		},
	},
}))

describe("messageSendPreparation", () => {
	beforeEach(() => {
		modeServiceMock.defaultAgentCode = undefined
		isModeValidMock.mockReset()
		isModeValidMock.mockReturnValue(false)
		isModeVisibleMock.mockReset()
		isModeVisibleMock.mockReturnValue(true)
	})

	it("normalizes the configured default employee for topic state and send params", async () => {
		modeServiceMock.defaultAgentCode = "agent-default"
		isModeValidMock.mockImplementation((mode) => mode === "agent-default")
		const setSelectedTopic = vi.fn()
		const selectedProject = {
			id: "project-1",
			workspace_id: "workspace-1",
		} as ProjectListItem
		const selectedTopic = {
			id: "topic-1",
			project_id: "project-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
			topic_mode: TopicMode.General,
		} as Topic

		const result = await preparePanelSend({
			params: {
				value: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
				},
				mentionItems: [],
				topicMode: "agent-default" as TopicMode,
			},
			context: {
				selectedProject,
				selectedTopic,
				setSelectedTopic,
			},
			tabPattern: "agent-default" as TopicMode,
			messagesLength: 0,
		})

		expect(result?.currentTopic).toEqual(
			expect.objectContaining({
				topic_mode: TopicMode.CustomAgent,
				agent_code: "agent-default",
			}),
		)
		expect(result?.params).toEqual(
			expect.objectContaining({
				topicMode: TopicMode.CustomAgent,
				extra: expect.objectContaining({ agent_code: "agent-default" }),
			}),
		)
	})

	it("clears the previous agent_code when switching to a built-in mode", async () => {
		modeServiceMock.defaultAgentCode = "agent-default"
		isModeValidMock.mockImplementation((mode) => mode === "agent-default")
		const selectedProject = {
			id: "project-1",
			workspace_id: "workspace-1",
		} as ProjectListItem
		const selectedTopic = {
			id: "topic-1",
			project_id: "project-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
			topic_mode: TopicMode.CustomAgent,
			agent_code: "agent-default",
		} as Topic

		const result = await preparePanelSend({
			params: {
				value: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
				},
				mentionItems: [],
				topicMode: TopicMode.Chat,
				extra: { agent_code: "agent-default", source: "retry" },
			},
			context: { selectedProject, selectedTopic },
			tabPattern: TopicMode.Chat,
			messagesLength: 1,
		})

		expect(result?.currentTopic?.topic_mode).toBe(TopicMode.Chat)
		expect(result?.currentTopic?.agent_code).toBeUndefined()
		expect(result?.params.extra).toEqual({ source: "retry" })
	})

	it("sends a configured built-in default as topic_pattern without agent_code", async () => {
		modeServiceMock.defaultAgentCode = TopicMode.PPT
		isModeValidMock.mockImplementation((mode) => mode === TopicMode.PPT)
		const selectedProject = {
			id: "project-1",
			workspace_id: "workspace-1",
		} as ProjectListItem
		const selectedTopic = {
			id: "topic-1",
			project_id: "project-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
			topic_mode: TopicMode.General,
		} as Topic

		const result = await preparePanelSend({
			params: {
				value: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
				},
				mentionItems: [],
				topicMode: TopicMode.PPT,
				extra: { agent_code: "stale-agent" },
			},
			context: { selectedProject, selectedTopic },
			tabPattern: TopicMode.PPT,
			messagesLength: 0,
		})

		expect(result?.currentTopic).toEqual(
			expect.objectContaining({
				topic_mode: TopicMode.PPT,
				agent_code: undefined,
			}),
		)
		expect(result?.params.topicMode).toBe(TopicMode.PPT)
		expect(result?.params.extra).toBeUndefined()
	})

	it("keeps the employee identifier as project_mode while initializing topic state", async () => {
		modeServiceMock.defaultAgentCode = "agent-default"
		isModeValidMock.mockImplementation((mode) => mode === "agent-default")
		const createProject = vi.fn().mockResolvedValue({
			project: { id: "project-1", workspace_id: "workspace-1" },
			topic: { id: "topic-1", project_id: "project-1" },
		})
		const setSelectedTopic = vi.fn()

		const result = await ensureProjectForMessageContext({
			context: {
				createProject,
				setSelectedProject: vi.fn(),
				setSelectedTopic,
			},
			tabPattern: "agent-default" as TopicMode,
		})

		expect(createProject).toHaveBeenCalledWith(
			expect.objectContaining({ projectMode: "agent-default" }),
		)
		expect(result?.currentTopic).toEqual(
			expect.objectContaining({
				topic_mode: TopicMode.CustomAgent,
				agent_code: "agent-default",
			}),
		)
	})

	it("should create a fresh topic when the selected topic belongs to another project", async () => {
		const createTopic = vi.fn().mockResolvedValue({
			id: "topic-b",
			project_id: "project-b",
			chat_topic_id: "chat-topic-b",
			chat_conversation_id: "conversation-b",
			topic_name: "",
			task_status: "waiting",
			task_mode: "",
			topic_mode: TopicMode.Chat,
			updated_at: "",
			user_id: "user-1",
			workspace_id: "workspace-1",
			token_used: null,
		})
		const setSelectedTopic = vi.fn()
		const selectedProject = {
			id: "project-b",
			workspace_id: "workspace-1",
		} as unknown as ProjectListItem
		const staleTopic = {
			id: "topic-a",
			project_id: "project-a",
			chat_topic_id: "chat-topic-a",
			chat_conversation_id: "conversation-a",
		} as unknown as Topic

		const result = await preparePanelSend({
			params: {
				value: {
					type: "doc",
					content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
				},
				mentionItems: [],
				topicMode: TopicMode.Chat,
			},
			context: {
				selectedProject,
				selectedTopic: staleTopic,
				createTopic,
				setSelectedTopic,
			},
			tabPattern: TopicMode.Chat,
			messagesLength: 0,
		})

		expect(createTopic).toHaveBeenCalledWith({
			selectedProject: expect.objectContaining({ id: "project-b" }),
		})
		expect(result?.currentTopic?.id).toBe("topic-b")
		expect(setSelectedTopic).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "topic-b",
				project_id: "project-b",
			}),
		)
	})
})
