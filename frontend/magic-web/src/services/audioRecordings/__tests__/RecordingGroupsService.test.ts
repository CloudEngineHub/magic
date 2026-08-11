import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { RecordingGroupsService } from "@/services/audioRecordings/RecordingGroupsService"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getWorkspaces: vi.fn(),
		getUngroupedAudioProjectsCount: vi.fn(),
		createWorkspace: vi.fn(),
		editWorkspace: vi.fn(),
		deleteWorkspace: vi.fn(),
		detachWorkspace: vi.fn(),
	},
}))

function createWorkspace(id: string, projectCount: number) {
	return {
		id,
		workspace_name: `Mock group ${id}`,
		workspace_type: "audio",
		project_count: projectCount,
	}
}

describe("RecordingGroupsService", () => {
	const service = new RecordingGroupsService()

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.getUngroupedAudioProjectsCount).mockResolvedValue({ count: 5 })
	})

	it("loads all audio workspace pages and computes total count", async () => {
		const firstPage = Array.from({ length: 200 }, (_, index) =>
			createWorkspace(`workspace-page-one-${index + 1}`, 1),
		)
		const secondPage = [createWorkspace("workspace-page-two-1", 2)]
		vi.mocked(SuperMagicApi.getWorkspaces)
			.mockResolvedValueOnce({ list: firstPage, total: 201 })
			.mockResolvedValueOnce({ list: secondPage, total: 201 })

		const result = await service.listGroups()

		expect(SuperMagicApi.getWorkspaces).toHaveBeenNthCalledWith(1, {
			page: 1,
			page_size: 200,
			workspace_type: "audio",
			auto_create: false,
		})
		expect(SuperMagicApi.getWorkspaces).toHaveBeenNthCalledWith(2, {
			page: 2,
			page_size: 200,
			workspace_type: "audio",
			auto_create: false,
		})
		expect(result.groups).toHaveLength(201)
		expect(result.ungroupedCount).toBe(5)
		expect(result.totalCount).toBe(207)
	})

	it("creates audio workspace groups with trimmed names", async () => {
		vi.mocked(SuperMagicApi.createWorkspace).mockResolvedValue(
			createWorkspace("workspace-created-1", 0),
		)

		const result = await service.createGroup("  Mock created group  ")

		expect(SuperMagicApi.createWorkspace).toHaveBeenCalledWith({
			workspace_name: "Mock created group",
			workspace_type: "audio",
		})
		expect(result.id).toBe("workspace-created-1")
		expect(result.isVirtual).toBe(false)
	})

	it("deletes groups through detach so recordings stay ungrouped", async () => {
		vi.mocked(SuperMagicApi.detachWorkspace).mockResolvedValue(undefined)

		await service.deleteGroup("workspace-mock-detach-1")

		expect(SuperMagicApi.detachWorkspace).toHaveBeenCalledWith({
			id: "workspace-mock-detach-1",
		})
		expect(SuperMagicApi.deleteWorkspace).not.toHaveBeenCalled()
	})
})
