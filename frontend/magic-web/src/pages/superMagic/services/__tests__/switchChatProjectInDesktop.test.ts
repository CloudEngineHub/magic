import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

const {
	navigateToChatProjectMock,
	getTopicDataByProjectMock,
} = vi.hoisted(() => ({
	navigateToChatProjectMock: vi.fn(),
	getTopicDataByProjectMock: vi.fn(),
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
	mergeProjectListItemWithStoreCache: (project: ProjectListItem) => project,
}))

vi.mock("../utils/superMagicCache", () => ({
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

vi.mock("../topicReadProgressService", () => ({
	default: {
		flushCurrentTopicReadProgress: vi.fn(),
	},
}))

vi.mock("../routeManageService", () => ({
	default: {
		navigateToChatProject: navigateToChatProjectMock,
		getCurrentRouteParams: vi.fn(() => ({})),
		isStaleScopedRefresh: vi.fn(() => false),
		fixRouteParams: vi.fn(),
		isCurrentChatProjectRoute: vi.fn(() => false),
	},
}))

vi.mock("../topicService", () => ({
	default: vi.fn().mockImplementation(() => ({
		fetchTopics: vi.fn(),
		getTopicDetail: vi.fn(),
	})),
}))

vi.mock("../workspaceService", () => ({
	default: vi.fn().mockImplementation(() => ({
		getWorkspaceDetail: vi.fn(),
		fetchWorkspaces: vi.fn(),
	})),
}))

vi.mock("../projectService", () => ({
	default: vi.fn().mockImplementation(() => ({
		getProjectDetail: vi.fn(),
		fetchProjects: vi.fn(),
	})),
}))

vi.mock("../chatConversationNameSync", () => ({
	syncChatConversationName: vi.fn(),
	resolveChatTopicId: vi.fn(),
	shouldSyncChatConversationName: vi.fn(),
	renameTopicWithChatSync: vi.fn(),
	syncChatProjectNameOnly: vi.fn(),
}))

import SuperMagicService from "../index"

const mockProject = {
	id: "project-beta",
	project_name: "Beta Chat",
	workspace_id: "workspace-chat",
	user_role: "owner",
	current_topic_id: "topic-beta",
} as unknown as ProjectListItem

const mockTopic = {
	id: "topic-beta",
	project_id: "project-beta",
	chat_topic_id: "chat-topic-beta",
	chat_conversation_id: "conv-beta",
} as unknown as Topic

describe("switchChatProjectInDesktop", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
			callback({ didTimeout: false, timeRemaining: () => 0 })
			return 1
		})
		;(SuperMagicService as unknown as { desktopChatSwitchGeneration: number }).desktopChatSwitchGeneration = 0
		;(SuperMagicService as unknown as { desktopChatSwitchInFlight: boolean }).desktopChatSwitchInFlight =
			false

		getTopicDataByProjectMock.mockResolvedValue(mockTopic)
		vi.spyOn(SuperMagicService, "getTopicDataByProject").mockImplementation(
			getTopicDataByProjectMock,
		)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	async function flushMicrotasks() {
		await Promise.resolve()
		await Promise.resolve()
		await Promise.resolve()
	}

	it("navigates optimistically before background topic fetch completes", async () => {
		let resolveTopic: (value: Topic) => void = () => {}
		getTopicDataByProjectMock.mockReturnValue(
			new Promise<Topic>((resolve) => {
				resolveTopic = resolve
			}),
		)

		const switchPromise = SuperMagicService.switchChatProjectInDesktop(mockProject, {
			topicId: "topic-beta",
		})

		await flushMicrotasks()

		expect(navigateToChatProjectMock).toHaveBeenCalledWith(mockProject, "topic-beta")

		resolveTopic(mockTopic)
		await switchPromise

		expect(getTopicDataByProjectMock).toHaveBeenCalledWith(mockProject, "topic-beta")
	})

	it("uses initialTopic without calling getTopicDataByProject", async () => {
		await SuperMagicService.switchChatProjectInDesktop(mockProject, {
			initialTopic: mockTopic,
		})

		expect(getTopicDataByProjectMock).not.toHaveBeenCalled()
		expect(navigateToChatProjectMock).toHaveBeenCalledWith(mockProject, "topic-beta")
	})

	it("replaces route when resolved topic differs from optimistic topic id", async () => {
		getTopicDataByProjectMock.mockResolvedValue({
			...mockTopic,
			id: "topic-resolved",
		})

		await SuperMagicService.switchChatProjectInDesktop(mockProject, {
			topicId: "topic-beta",
		})

		expect(navigateToChatProjectMock).toHaveBeenLastCalledWith(
			mockProject,
			"topic-resolved",
			true,
		)
	})

	it("drops stale async result when a newer desktop chat switch starts", async () => {
		let resolveFirst: (value: Topic) => void = () => {}
		getTopicDataByProjectMock.mockImplementationOnce(
			() =>
				new Promise<Topic>((resolve) => {
					resolveFirst = resolve
				}),
		)
		getTopicDataByProjectMock.mockResolvedValue({
			...mockTopic,
			id: "topic-newer",
			project_id: "project-gamma",
		})

		const firstSwitch = SuperMagicService.switchChatProjectInDesktop(mockProject, {
			topicId: "topic-beta",
		})

		await flushMicrotasks()

		await SuperMagicService.switchChatProjectInDesktop(
			{ ...mockProject, id: "project-gamma" } as ProjectListItem,
			{ topicId: "topic-gamma" },
		)

		resolveFirst(mockTopic)
		await firstSwitch

		expect(navigateToChatProjectMock).not.toHaveBeenCalledWith(
			mockProject,
			"topic-beta",
			true,
		)
	})
})
