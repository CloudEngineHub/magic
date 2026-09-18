import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import type { CreatedProject, ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

const trackMock = vi.hoisted(() => vi.fn())

const { mockProjectStore, mockRecentProjectsStore } = vi.hoisted(() => ({
	mockProjectStore: {
		projects: [] as ProjectListItem[],
		setProjects: vi.fn(),
		setProjectsForWorkspace: vi.fn(),
	},
	mockRecentProjectsStore: {
		invalidate: vi.fn(),
		items: [] as ProjectListItem[],
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createProject: vi.fn(),
		getProjects: vi.fn(),
		getProjectsWithCollaboration: vi.fn(),
		getCollaborationProjects: vi.fn(),
	},
}))

vi.mock("@/services/analytics", () => ({
	track: trackMock,
}))

vi.mock("@/pages/superMagic/stores/core/project", () => ({
	default: mockProjectStore,
}))

vi.mock("@/pages/superMagic/stores/core/recentProjects", () => ({
	default: mockRecentProjectsStore,
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	workspaceStore: {
		workspaces: [],
		setSelectedWorkspace: vi.fn(),
	},
	topicStore: {},
}))

vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	ensureChatWorkspaceId: vi.fn(),
	getCachedChatWorkspaceId: vi.fn(),
}))

vi.mock("../chatConversationNameSync", () => ({
	shouldSyncChatConversationName: vi.fn(),
	syncChatConversationName: vi.fn(),
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: { writeText: vi.fn() },
}))

vi.mock("@/pages/superMagic/constants", () => ({
	SHARE_WORKSPACE_ID: "share",
	isOtherCollaborationProject: vi.fn(() => false),
}))

vi.mock("@/pages/superMagic/utils/project", () => ({
	generateCollaborationProjectUrl: vi.fn(),
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: { userInfo: { user_id: "user-1" } },
	},
}))

import ProjectService from "../projectService"

function createProjectResponse(project: Partial<ProjectListItem> = {}): CreatedProject {
	const id = project.id ?? "project-new"
	return {
		project: {
			id,
			workspace_id: project.workspace_id ?? "workspace-1",
			project_name: "New",
			...project,
		} as ProjectListItem,
		topic: { id: "topic-new", project_id: id } as CreatedProject["topic"],
	}
}

describe("ProjectService scene project-created analytics", () => {
	let projectService: ProjectService

	beforeEach(() => {
		vi.clearAllMocks()
		mockProjectStore.projects = []
		projectService = new ProjectService()
		vi.mocked(SuperMagicApi.getProjectsWithCollaboration).mockResolvedValue({
			list: [],
			total: 0,
		} as never)
	})

	it("reports project_id and workspace_id from the create response", async () => {
		vi.mocked(SuperMagicApi.createProject).mockResolvedValue(
			createProjectResponse({
				id: "project-9",
				workspace_id: "workspace-from-api",
			}),
		)

		await projectService.createProject({
			workspaceId: "workspace-request",
			projectMode: TopicMode.General,
			projectName: "New",
		})

		expect(trackMock).toHaveBeenCalledTimes(2)
		expect(trackMock).toHaveBeenCalledWith("workspace_project_created", {
			project_id: "project-9",
			workspace_id: "workspace-from-api",
		})
		expect(trackMock).toHaveBeenCalledWith("workspace_topic_created", {
			topic_id: "topic-new",
			project_id: "project-9",
			workspace_id: "workspace-from-api",
		})
	})

	it("falls back to the request workspace_id when the response omits it", async () => {
		vi.mocked(SuperMagicApi.createProject).mockResolvedValue(
			createProjectResponse({
				id: "project-9",
				workspace_id: "",
			}),
		)

		await projectService.createProject({
			workspaceId: "workspace-request",
			projectMode: TopicMode.General,
		})

		expect(trackMock).toHaveBeenCalledWith("workspace_project_created", {
			project_id: "project-9",
			workspace_id: "workspace-request",
		})
	})

	it("uses the explicit product entry instead of inferring it from agent mode", async () => {
		vi.mocked(SuperMagicApi.createProject).mockResolvedValue(
			createProjectResponse({
				id: "project-chat",
				workspace_id: "workspace-chat",
			}),
		)

		await projectService.createProject({
			workspaceId: "workspace-chat",
			projectMode: TopicMode.General,
			creationScene: "chat",
		})

		expect(trackMock).toHaveBeenCalledWith("chat_project_created", {
			project_id: "project-chat",
			workspace_id: "workspace-chat",
		})
		expect(trackMock).toHaveBeenCalledWith("chat_topic_created", {
			topic_id: "topic-new",
			project_id: "project-chat",
			workspace_id: "workspace-chat",
		})
	})

	it("does not report when the response has no project id", async () => {
		vi.mocked(SuperMagicApi.createProject).mockResolvedValue(
			createProjectResponse({
				id: "",
				workspace_id: "workspace-1",
			}),
		)

		await projectService.createProject({
			workspaceId: "workspace-1",
			projectMode: TopicMode.General,
		})

		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when the response project id is blank", async () => {
		vi.mocked(SuperMagicApi.createProject).mockResolvedValue(
			createProjectResponse({
				id: "   ",
				workspace_id: "workspace-1",
			}),
		)

		await projectService.createProject({
			workspaceId: "workspace-1",
			projectMode: TopicMode.General,
		})

		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when createProject fails", async () => {
		vi.mocked(SuperMagicApi.createProject).mockRejectedValue(new Error("create-failed"))

		await expect(
			projectService.createProject({
				workspaceId: "workspace-1",
				projectMode: TopicMode.General,
			}),
		).resolves.toBeNull()

		expect(trackMock).not.toHaveBeenCalled()
	})

	it("reports once when concurrent callers share the same create request", async () => {
		let resolveCreate!: (value: CreatedProject) => void
		vi.mocked(SuperMagicApi.createProject).mockReturnValue(
			new Promise((resolve) => {
				resolveCreate = resolve
			}),
		)

		const first = projectService.createProject({
			workspaceId: "workspace-1",
			projectMode: TopicMode.General,
			projectName: "Same",
		})
		const second = projectService.createProject({
			workspaceId: "workspace-1",
			projectMode: TopicMode.General,
			projectName: "Same",
		})

		resolveCreate(createProjectResponse({ id: "project-shared", workspace_id: "workspace-1" }))
		await Promise.all([first, second])

		expect(SuperMagicApi.createProject).toHaveBeenCalledTimes(1)
		expect(trackMock).toHaveBeenCalledTimes(2)
	})
})
