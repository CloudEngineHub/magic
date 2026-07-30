import { act, render, screen, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem, Topic } from "../Workspace/types"
import ChatProjectPageDesktop from "./index.desktop"

const mockState = vi.hoisted(() => ({
	projectId: "project-1",
	topicId: "topic-1",
	projectStore: {
		selectedProject: null as ProjectListItem | null,
		projects: [] as ProjectListItem[],
	},
	topicStore: {
		selectedTopic: null as Topic | null,
	},
	workspaceStore: {
		selectedWorkspace: null as { id: string } | null,
	},
	refreshState: vi.fn(),
	isDesktopChatSwitchInProgress: false,
}))

function createProject(): ProjectListItem {
	return {
		id: "project-1",
	} as unknown as ProjectListItem
}

function createCompleteTopic(): Topic {
	return {
		id: "topic-1",
		project_id: "project-1",
		chat_conversation_id: "conversation-1",
		chat_topic_id: "chat-topic-1",
	} as unknown as Topic
}

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-router", () => ({
	useParams: () => ({
		projectId: mockState.projectId,
		topicId: mockState.topicId,
	}),
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: mockState.projectStore,
	topicStore: mockState.topicStore,
	workspaceStore: mockState.workspaceStore,
}))

vi.mock("@/pages/superMagic/services", () => ({
	__esModule: true,
	default: {
		refreshState: mockState.refreshState,
		isDesktopChatSwitchInProgress: () => mockState.isDesktopChatSwitchInProgress,
	},
}))

vi.mock("@/pages/superMagic/hooks/useChatExpertSwitch", () => ({
	useChatExpertSwitch: vi.fn(),
}))

vi.mock("@/pages/superMagic/providers/file-action-visibility-provider", () => ({
	FileActionVisibilityProvider: ({ children }: PropsWithChildren) => <>{children}</>,
	HIDE_CLAW_FILE_ACTIONS: {},
}))

vi.mock("@/pages/superMagic/lazy/skeleton/ChatProjectPageDesktopSkeleton", () => ({
	__esModule: true,
	default: () => <div data-testid="chat-project-skeleton" />,
}))

vi.mock("@/pages/superMagic/pages/TopicPage/index.desktop", () => ({
	__esModule: true,
	default: () => <div data-testid="chat-topic-page" />,
}))

describe("ChatProjectPageDesktop route loading", () => {
	beforeEach(() => {
		mockState.projectId = "project-1"
		mockState.topicId = "topic-1"
		mockState.projectStore.selectedProject = null
		mockState.projectStore.projects = []
		mockState.topicStore.selectedTopic = null
		mockState.workspaceStore.selectedWorkspace = null
		mockState.refreshState.mockReset()
		mockState.refreshState.mockResolvedValue(undefined)
		mockState.isDesktopChatSwitchInProgress = false
	})

	it("shows the existing skeleton and restores state on cold entry", async () => {
		render(<ChatProjectPageDesktop />)

		expect(screen.getByTestId("chat-project-skeleton")).toBeInTheDocument()
		expect(screen.queryByTestId("chat-topic-page")).not.toBeInTheDocument()
		await waitFor(() => {
			expect(mockState.refreshState).toHaveBeenCalledWith({
				projectId: "project-1",
				topicId: "topic-1",
			})
		})
	})

	it("mounts the real chat topic page only after route context is complete", async () => {
		mockState.projectStore.selectedProject = createProject()
		mockState.projectStore.projects = [createProject()]
		mockState.workspaceStore.selectedWorkspace = { id: "workspace-1" }
		mockState.topicStore.selectedTopic = createCompleteTopic()

		render(<ChatProjectPageDesktop />)

		expect(await screen.findByTestId("chat-topic-page")).toBeInTheDocument()
		expect(screen.queryByTestId("chat-project-skeleton")).not.toBeInTheDocument()
		expect(mockState.refreshState).not.toHaveBeenCalled()
	})

	it("keeps the skeleton without duplicating refresh during optimistic desktop switching", () => {
		mockState.projectStore.selectedProject = createProject()
		mockState.projectStore.projects = [createProject()]
		mockState.workspaceStore.selectedWorkspace = { id: "workspace-1" }
		mockState.isDesktopChatSwitchInProgress = true

		render(<ChatProjectPageDesktop />)

		expect(screen.getByTestId("chat-project-skeleton")).toBeInTheDocument()
		expect(mockState.refreshState).not.toHaveBeenCalled()
	})

	it("does not restart route recovery when the project list changes while refresh is pending", async () => {
		let resolveRefresh: (() => void) | undefined
		mockState.refreshState.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveRefresh = resolve
			}),
		)

		const { rerender } = render(<ChatProjectPageDesktop />)

		await waitFor(() => {
			expect(mockState.refreshState).toHaveBeenCalledTimes(1)
		})

		mockState.projectStore.projects = [createProject()]
		rerender(<ChatProjectPageDesktop />)
		expect(mockState.refreshState).toHaveBeenCalledTimes(1)
		expect(screen.getByTestId("chat-project-skeleton")).toBeInTheDocument()

		mockState.projectStore.selectedProject = createProject()
		mockState.workspaceStore.selectedWorkspace = { id: "workspace-1" }
		mockState.topicStore.selectedTopic = createCompleteTopic()

		await act(async () => {
			resolveRefresh?.()
		})
		rerender(<ChatProjectPageDesktop />)

		expect(await screen.findByTestId("chat-topic-page")).toBeInTheDocument()
		expect(mockState.refreshState).toHaveBeenCalledTimes(1)
	})
})
