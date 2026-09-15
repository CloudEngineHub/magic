import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChatProjectDetailLayout } from "../ChatProjectDetailLayout"

const mockState = vi.hoisted(() => ({
	updateAttachments: vi.fn(),
	projectStore: {
		selectedProject: null as { id: string; project_name: string } | null,
		projects: [],
	},
	topicStore: {
		selectedTopic: null,
	},
	workspaceStore: {
		selectedWorkspace: null,
		workspaces: [],
	},
	projectFilesStore: {
		workspaceFileTree: [],
		workspaceFilesList: [],
	},
}))

vi.mock("mobx-react-lite", () => ({
	// Keep observer transparent because this focused test drives plain mocked store snapshots.
	observer: <T,>(component: T) => component,
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: mockState.projectStore,
	topicStore: mockState.topicStore,
	workspaceStore: mockState.workspaceStore,
}))

vi.mock("@/stores/projectFiles", () => ({
	default: mockState.projectFilesStore,
}))

vi.mock(
	"@/pages/superMagicMobile/components/HierarchicalWorkspacePopup/hooks/useAttachments",
	() => ({
		useAttachments: () => ({
			updateAttachments: mockState.updateAttachments,
		}),
	}),
)

vi.mock("../ChatProjectMessagePanel", () => ({
	ChatProjectMessagePanel: () => <div data-testid="mock-chat-project-message-panel" />,
}))

vi.mock("../useChatConversationActions", () => ({
	useChatConversationActions: () => ({
		actionSheetVisible: false,
		filesDrawerOpen: false,
		setFilesDrawerOpen: vi.fn(),
		openConversationActionSheet: vi.fn(),
		closeConversationActionSheet: vi.fn(),
		conversationActionGroups: [],
		conversationActionPopupTitle: "Mock conversation",
		conversationActionPopupSubtitle: "Mock subtitle",
		projectActionComponents: null,
		topicActionComponents: null,
	}),
}))

vi.mock("@/pages/superMagicMobile/hooks/useConversationFeedbackSheet", () => ({
	useConversationFeedbackSheet: () => ({
		feedbackSheetOpen: false,
		feedbackPrefill: undefined,
		openConversationFeedback: vi.fn(),
		closeConversationFeedback: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagicMobile/components/ConversationActionsPopup", () => ({
	default: () => null,
}))

vi.mock("@/layouts/BaseLayoutMobile/components/MobileSettings/components/FeedbackSheet", () => ({
	MobileSettingsFeedbackSheet: () => null,
}))

vi.mock("@/pages/superMagicMobile/pages/TopicPage/components/TopicFilesPopup", () => ({
	TopicFilesPopup: () => null,
}))

/** Creates synthetic project data without relying on production identifiers or names. */
function createMockProject(id: string) {
	return {
		id,
		project_name: `Mock project ${id}`,
	}
}

describe("ChatProjectDetailLayout", () => {
	beforeEach(() => {
		mockState.updateAttachments.mockReset()
		mockState.projectStore.selectedProject = null
	})

	it("loads attachments when the chat detail first mounts", async () => {
		const project = createMockProject("mock-project-alpha")
		mockState.projectStore.selectedProject = project

		render(<ChatProjectDetailLayout />)

		await waitFor(() => {
			expect(mockState.updateAttachments).toHaveBeenCalledTimes(1)
		})
		expect(mockState.updateAttachments).toHaveBeenCalledWith(project)
	})

	it("does not load attachments without a selected project", async () => {
		render(<ChatProjectDetailLayout />)

		await act(async () => undefined)

		expect(mockState.updateAttachments).not.toHaveBeenCalled()
	})

	it("loads attachments again only when the selected project id changes", async () => {
		const firstProject = createMockProject("mock-project-alpha")
		mockState.projectStore.selectedProject = firstProject
		const { rerender } = render(<ChatProjectDetailLayout />)

		await waitFor(() => {
			expect(mockState.updateAttachments).toHaveBeenCalledTimes(1)
		})

		rerender(<ChatProjectDetailLayout />)
		expect(mockState.updateAttachments).toHaveBeenCalledTimes(1)

		const secondProject = createMockProject("mock-project-beta")
		mockState.projectStore.selectedProject = secondProject
		rerender(<ChatProjectDetailLayout />)

		await waitFor(() => {
			expect(mockState.updateAttachments).toHaveBeenCalledTimes(2)
		})
		expect(mockState.updateAttachments).toHaveBeenLastCalledWith(secondProject)
	})
})
