import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import { getPublishedMicroAppList, useMicroAppsPage } from "../useMicroAppsPage"

const mocks = vi.hoisted(() => ({
	getMicroAppWorkspace: vi.fn(),
	getProjectsWithCollaboration: vi.fn(),
	getPublishedMicroAppProjects: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppWorkspace: mocks.getMicroAppWorkspace,
		getProjectsWithCollaboration: mocks.getProjectsWithCollaboration,
		getPublishedMicroAppProjects: mocks.getPublishedMicroAppProjects,
	},
}))

describe("useMicroAppsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getMicroAppWorkspace.mockResolvedValue({
			id: "workspace-1",
			name: "Micro Apps",
		})
		mocks.getProjectsWithCollaboration.mockResolvedValue({
			list: [
				{
					id: "project-1",
					project_name: "Draft App",
					workspace_name: "Micro Apps",
				},
			],
		})
		mocks.getPublishedMicroAppProjects.mockResolvedValue({
			list: [
				{
					project: {
						id: "933138305533177857",
						project_name: "Published App",
						project_mode: "micro-app",
					},
					publish: {
						app_id: "app-2",
						project_id: "933138305533177857",
						resource_id: "resource-2",
						share_type: ShareType.Public,
						access_url: "",
						published_at: "2026-07-08 01:06:04",
					},
				},
			],
		})
	})

	it("loads workspace projects and accessible published micro apps", async () => {
		const { result } = renderHook(() => useMicroAppsPage())

		await waitFor(() => {
			expect(result.current.loading).toBe(false)
		})

		expect(mocks.getProjectsWithCollaboration).toHaveBeenCalledWith({
			workspace_id: "workspace-1",
			page: 1,
			page_size: 100,
			show_collaboration: 1,
		})
		expect(mocks.getPublishedMicroAppProjects).toHaveBeenCalledWith({
			page: 1,
			page_size: 100,
			keyword: "",
		})
		expect(result.current.projects).toHaveLength(1)
		expect(result.current.publishedProjects).toEqual([
			{
				app_id: "app-2",
				project_id: "933138305533177857",
				project_name: "Published App",
				resource_id: "resource-2",
				access_url: "",
				published_at: "2026-07-08 01:06:04",
				share_type: ShareType.Public,
				share_range: undefined,
				share_id: undefined,
				share_code: undefined,
				target_ids: [],
				password: undefined,
				publish_status: undefined,
			},
		])
	})

	it("reads published list from wrapped response and nested project payload", () => {
		expect(
			getPublishedMicroAppList({
				data: {
					list: [
						{
							project: {
								id: "933138305533177857",
								project_name: "手机消费者问卷调查生成",
							},
							publish: {
								app_id: "app-2",
								project_id: "933138305533177857",
								resource_id: "933152014460612609",
								share_type: ShareType.PasswordProtected,
								access_url: "",
								published_at: "2026-07-08 01:06:04",
							},
						},
					],
				},
			}),
		).toEqual([
			{
				app_id: "app-2",
				project_id: "933138305533177857",
				project_name: "手机消费者问卷调查生成",
				resource_id: "933152014460612609",
				share_id: undefined,
				share_code: undefined,
				share_type: ShareType.PasswordProtected,
				share_range: undefined,
				target_ids: [],
				access_url: "",
				published_at: "2026-07-08 01:06:04",
				password: undefined,
				publish_status: undefined,
			},
		])
	})
})
