import { beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectStatus, type ProjectListItem } from "../../pages/Workspace/types"
import { TopicMode } from "../../pages/Workspace/TopicMode"
import { generateCollaborationProjectUrl } from "../project"

const mocks = vi.hoisted(() => ({
	getRoutePath: vi.fn(),
}))

vi.mock("@/routes/history/helpers", () => ({
	convertSearchParams: () => ({}),
	getRoutePath: mocks.getRoutePath,
}))

vi.mock("@/utils/env", () => ({
	env: () => "https://magic.example.com",
}))

const project: ProjectListItem = {
	id: "project-1",
	project_status: ProjectStatus.FINISHED,
	project_mode: TopicMode.MicroApp,
	workspace_id: "workspace-1",
	work_dir: "micro-app",
	workspace_name: "Workspace",
	project_name: "Micro App",
	current_topic_id: "topic-1",
	current_topic_status: "finished",
	created_at: "2026-08-05 00:00:00",
	updated_at: "2026-08-05 00:00:00",
	tag: "",
}

describe("generateCollaborationProjectUrl", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("微应用协作地址使用 app_id 对应的微应用路由", () => {
		mocks.getRoutePath.mockReturnValue("/cn/super/micro-app/app-1")

		const url = generateCollaborationProjectUrl({ ...project, app_id: "app-1" })

		expect(mocks.getRoutePath).toHaveBeenCalledWith({
			name: "MicroApp",
			params: { appId: "app-1" },
			query: {},
		})
		expect(url).toBe("https://magic.example.com/cn/super/micro-app/app-1")
	})

	it("普通项目继续使用 project_id 对应的项目路由", () => {
		mocks.getRoutePath.mockReturnValue("/cn/super/project-1")

		generateCollaborationProjectUrl(project)

		expect(mocks.getRoutePath).toHaveBeenCalledWith({
			name: "SuperWorkspaceProjectState",
			params: { projectId: "project-1" },
			query: {},
		})
	})
})
