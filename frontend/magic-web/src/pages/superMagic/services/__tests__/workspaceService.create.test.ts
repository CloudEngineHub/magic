import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"

const trackMock = vi.hoisted(() => vi.fn())

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createWorkspace: vi.fn(),
	},
}))

vi.mock("@/services/analytics", () => ({
	track: trackMock,
}))

vi.mock("@/pages/superMagic/stores/core/workspace", () => ({
	default: {
		beginWorkspaceListFetch: vi.fn(),
		endWorkspaceListFetch: vi.fn(),
		setWorkspaces: vi.fn(),
		setSelectedWorkspace: vi.fn(),
		updateWorkspace: vi.fn(),
		getWorkspaceById: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/stores/core/project", () => ({
	default: {
		selectedProject: null,
		setSelectedProject: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/orderUtils", () => ({
	getInsertIndexByAnchors: vi.fn(),
	isSameOrder: vi.fn(),
}))

vi.mock("@/pages/superMagic/services/orderErrorReporter", () => ({
	createOrderRequestOptions: vi.fn(),
	reportOrderApiError: vi.fn(),
}))

vi.mock("@/pages/superMagic/services/workspaceListSearchInvalidation", () => ({
	invalidateWorkspaceSearchResults: vi.fn(),
}))

import WorkspaceService from "../workspaceService"

describe("WorkspaceService workspace_created analytics", () => {
	let workspaceService: InstanceType<typeof WorkspaceService>

	beforeEach(() => {
		vi.clearAllMocks()
		workspaceService = new WorkspaceService()
	})

	it("reports workspace_id from the create response", async () => {
		vi.mocked(SuperMagicApi.createWorkspace).mockResolvedValue({
			id: "workspace-9",
			name: "New",
		} as never)

		await expect(workspaceService.createWorkspace("New")).resolves.toMatchObject({
			id: "workspace-9",
		})

		expect(trackMock).toHaveBeenCalledTimes(1)
		expect(trackMock).toHaveBeenCalledWith("workspace_created", {
			workspace_id: "workspace-9",
		})
	})

	it("does not report when the response has no id", async () => {
		vi.mocked(SuperMagicApi.createWorkspace).mockResolvedValue({
			id: "",
			name: "New",
		} as never)

		await expect(workspaceService.createWorkspace("New")).resolves.toBeNull()
		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when the response id is blank", async () => {
		vi.mocked(SuperMagicApi.createWorkspace).mockResolvedValue({
			id: "   ",
			name: "New",
		} as never)

		await expect(workspaceService.createWorkspace("New")).resolves.toBeNull()
		expect(trackMock).not.toHaveBeenCalled()
	})

	it("does not report when createWorkspace fails", async () => {
		vi.mocked(SuperMagicApi.createWorkspace).mockRejectedValue(new Error("create-failed"))

		await expect(workspaceService.createWorkspace("New")).rejects.toThrow("create-failed")
		expect(trackMock).not.toHaveBeenCalled()
	})
})
