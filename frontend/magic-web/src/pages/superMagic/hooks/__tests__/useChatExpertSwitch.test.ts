import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useChatExpertSwitch } from "../useChatExpertSwitch"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

const createProjectInChatWorkspaceMock = vi.fn()
const ensureChatWorkspaceMock = vi.fn()
const switchChatProjectMock = vi.fn()
const setProjectDefaultTopicModeMock = vi.fn()

vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	useChatWorkspace: () => ({
		chatWorkspace: null,
		createProjectInChatWorkspace: createProjectInChatWorkspaceMock,
		ensureChatWorkspace: ensureChatWorkspaceMock,
	}),
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		switchChatProject: (...args: unknown[]) => switchChatProjectMock(...args),
	},
}))

vi.mock("@/services/superMagic/ProjectTopicService", () => ({
	default: {
		setProjectDefaultTopicMode: (...args: unknown[]) => setProjectDefaultTopicModeMock(...args),
	},
}))

describe("useChatExpertSwitch", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		ensureChatWorkspaceMock.mockResolvedValue({ id: "workspace-alpha", workspace_type: "chat" })
	})

	it("creates a new chat project and switches via the platform chat switcher when Create_New_Topic fires", async () => {
		createProjectInChatWorkspaceMock.mockResolvedValue({
			project: {
				id: "project-alpha",
				workspace_id: "workspace-alpha",
			},
			topic: {
				id: "topic-alpha",
			},
		})

		renderHook(() => useChatExpertSwitch())

		await pubsub.publish(PubSubEvents.Create_New_Topic, {
			topicMode: TopicMode.General,
		})

		await vi.waitFor(() => {
			expect(createProjectInChatWorkspaceMock).toHaveBeenCalledWith({
				projectMode: TopicMode.General,
			})
		})

		expect(setProjectDefaultTopicModeMock).toHaveBeenCalledWith(
			"workspace-alpha",
			"project-alpha",
			TopicMode.General,
		)
		expect(switchChatProjectMock).toHaveBeenCalledWith(
			{
				id: "project-alpha",
				workspace_id: "workspace-alpha",
			},
			{
				id: "topic-alpha",
			},
			{
				chatWorkspace: { id: "workspace-alpha", workspace_type: "chat" },
			},
		)
	})

	it("ignores Create_New_Topic events without topicMode", async () => {
		renderHook(() => useChatExpertSwitch())

		await pubsub.publish(PubSubEvents.Create_New_Topic, {})

		expect(createProjectInChatWorkspaceMock).not.toHaveBeenCalled()
	})
})
