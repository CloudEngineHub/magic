import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"

const {
	projectServiceMock,
	workspaceServiceMock,
	topicServiceMock,
	routeManageServiceMock,
	projectStoreMock,
	workspaceStoreMock,
	topicStoreMock,
} = vi.hoisted(() => ({
	projectServiceMock: {
		getProjectDetail: vi.fn(),
		fetchProjects: vi.fn(),
	},
	workspaceServiceMock: {
		getWorkspaceDetail: vi.fn(),
		fetchWorkspaces: vi.fn(),
	},
	topicServiceMock: {
		fetchTopics: vi.fn(),
		getTopicDetail: vi.fn(),
	},
	routeManageServiceMock: {
		getCurrentRouteParams: vi.fn(() => ({})),
		isStaleScopedRefresh: vi.fn(() => false),
		fixRouteParams: vi.fn(),
		isCurrentChatProjectRoute: vi.fn(() => false),
		navigateToWorkspace: vi.fn(),
		navigateToHome: vi.fn(),
	},
	projectStoreMock: {
		selectedProject: { id: "project-stale" },
		setSelectedProject: vi.fn(),
		updateProject: vi.fn(),
	},
	workspaceStoreMock: {
		selectedWorkspace: null as Workspace | null,
		workspaces: [] as Workspace[],
		setSelectedWorkspace: vi.fn(),
	},
	topicStoreMock: {
		selectedTopic: null,
		setSelectedTopic: vi.fn(),
		updateTopicName: vi.fn(),
	},
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: { isMobile: false },
}))

vi.mock("i18next", () => ({
	t: (key: string) => key,
}))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: {} } },
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {},
}))

vi.mock("@/services/superMagic/topicModel", () => ({
	superMagicTopicModelService: {},
	superMagicTopicModelCacheService: {},
	DEFAULT_TOPIC_ID: "default",
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {},
}))

vi.mock("@/pages/superMagicMobile/utils/mergeProjectListItemWithStoreCache", () => ({
	mergeProjectListItemWithStoreCache: (project: unknown) => project,
}))

vi.mock("../../utils/superMagicCache", () => ({
	UserWorkspaceMapCache: { get: vi.fn(() => null), set: vi.fn() },
}))

vi.mock("../constants", () => ({
	SHARE_WORKSPACE_ID: "share-workspace",
	SHARE_WORKSPACE_DATA: () => ({ id: "share-workspace" }),
	isOtherCollaborationProject: () => false,
	isCollaborationWorkspace: () => false,
}))

vi.mock("../utils/permission", () => ({
	isOwner: () => true,
	isReadOnlyProject: () => false,
}))

vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	ensureChatWorkspace: vi.fn(),
}))

vi.mock("../topicReadProgressService", () => ({
	default: {
		flushCurrentTopicReadProgress: vi.fn(),
	},
}))

vi.mock("../routeManageService", () => ({
	default: routeManageServiceMock,
}))

vi.mock("../topicService", () => ({
	default: vi.fn().mockImplementation(() => topicServiceMock),
}))

vi.mock("../workspaceService", () => ({
	default: vi.fn().mockImplementation(() => workspaceServiceMock),
}))

vi.mock("../projectService", () => ({
	default: vi.fn().mockImplementation(() => projectServiceMock),
}))

vi.mock("../../stores/core", () => ({
	projectStore: projectStoreMock,
	workspaceStore: workspaceStoreMock,
	topicStore: topicStoreMock,
}))

vi.mock("../chatConversationNameSync", () => ({
	syncChatConversationName: vi.fn(),
	resolveChatTopicId: vi.fn(),
	shouldSyncChatConversationName: vi.fn(),
	renameTopicWithChatSync: vi.fn(),
	syncChatProjectNameOnly: vi.fn(),
}))

import SuperMagicService from "../index"

describe("SuperMagicService.refreshState", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
			callback({ didTimeout: false, timeRemaining: () => 0 })
			return 1
		})
		workspaceStoreMock.selectedWorkspace = null
		workspaceStoreMock.workspaces = []
		routeManageServiceMock.getCurrentRouteParams.mockReturnValue({})
		routeManageServiceMock.isStaleScopedRefresh.mockReturnValue(false)
		workspaceServiceMock.getWorkspaceDetail.mockResolvedValue({
			id: "workspace-alpha",
			workspace_type: "default",
		})
	})

	it("continues restoring workspace state when route only provides workspaceId", async () => {
		await SuperMagicService.refreshState({ workspaceId: "workspace-alpha" })

		expect(projectStoreMock.setSelectedProject).toHaveBeenCalledWith(null)
		expect(workspaceServiceMock.getWorkspaceDetail).toHaveBeenCalledWith("workspace-alpha", {
			enableErrorMessagePrompt: false,
		})
		expect(workspaceStoreMock.setSelectedWorkspace).toHaveBeenCalledWith({
			id: "workspace-alpha",
			workspace_type: "default",
		})
		expect(projectServiceMock.fetchProjects).toHaveBeenCalledWith(
			{
				workspaceId: "workspace-alpha",
				page: 1,
			},
			{ enableErrorMessagePrompt: false },
		)
		expect(routeManageServiceMock.fixRouteParams).toHaveBeenCalled()
	})

	it("uses the provided normal workspace when navigating home from chat workspace", async () => {
		const homeWorkspace = {
			id: "workspace-home",
			workspace_type: "default",
		} as Workspace
		workspaceStoreMock.selectedWorkspace = {
			id: "workspace-chat",
			workspace_type: "chat",
		} as Workspace
		workspaceStoreMock.workspaces = [
			homeWorkspace,
			{ id: "workspace-chat", workspace_type: "chat" } as Workspace,
		]

		await SuperMagicService.navigateToHome("workspace-home")

		expect(workspaceStoreMock.setSelectedWorkspace).toHaveBeenCalledWith(homeWorkspace)
		expect(routeManageServiceMock.navigateToWorkspace).toHaveBeenCalledWith(
			"workspace-home",
			false,
		)
	})
})
