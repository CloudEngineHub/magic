import { useState } from "react"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RESOURCE_TYPE, type RecycleBinItem } from "../recycle-bin-domain"
import { useRecycleBinActions } from "../useRecycleBinActions"

const mocks = vi.hoisted(() => ({
	checkRecycleBinParent: vi.fn(),
	restoreRecycleBinResources: vi.fn(),
	moveRecycleBinProject: vi.fn(),
	fetchWorkspaces: vi.fn(),
	fetchProjects: vi.fn(),
}))

vi.mock("ahooks", () => ({
	useRequest: (request: (...args: unknown[]) => unknown) => ({
		runAsync: (...args: unknown[]) => request(...args),
		loading: false,
	}),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apis", () => ({
	RecycleBinApi: {
		checkRecycleBinParent: mocks.checkRecycleBinParent,
		restoreRecycleBinResources: mocks.restoreRecycleBinResources,
		moveRecycleBinProject: mocks.moveRecycleBinProject,
		batchMoveRecycleBinProject: vi.fn(),
		moveRecycleBinTopic: vi.fn(),
		batchMoveRecycleBinTopic: vi.fn(),
		permanentDeleteRecycleBin: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		workspace: { fetchWorkspaces: mocks.fetchWorkspaces },
		project: { fetchProjects: mocks.fetchProjects },
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	workspaceStore: { workspaces: [], selectedWorkspace: null },
	projectStore: {
		getProjectsByWorkspace: () => [],
		loadProjectsForWorkspace: vi.fn(),
	},
}))

const microAppItem: RecycleBinItem = {
	id: "trash-1",
	resourceId: "app-1",
	resourceType: RESOURCE_TYPE.MICRO_APP,
	category: "microApps",
	title: "客户跟进助手",
	path: "微应用",
	deletedOn: "2026-08-04 12:00:00",
	remainingDays: 30,
}

describe("useRecycleBinActions micro app restore", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.fetchWorkspaces.mockResolvedValue(undefined)
		mocks.fetchProjects.mockResolvedValue(undefined)
		mocks.checkRecycleBinParent.mockResolvedValue({
			items_with_conflict: [{ resource_id: "app-1", conflict: { type: "parent_missing" } }],
			items_no_conflict: [],
		})
		mocks.restoreRecycleBinResources.mockResolvedValue({
			success_count: 1,
			failed_count: 0,
			results: [{ resource_id: "app-1", success: true }],
		})
	})

	it("restores by app_id without opening a workspace picker", async () => {
		const onRefresh = vi.fn()
		const { result } = renderHook(() => {
			const [items, setItems] = useState([microAppItem])
			const actions = useRecycleBinActions({
				items,
				setItems,
				selectedIds: [],
				hasMixedSelectionTypes: false,
				onRefresh,
			})
			return { actions, items }
		})

		await act(async () => {
			await result.current.actions.openRestoreModal({ kind: "item", item: microAppItem })
		})

		expect(result.current.actions.moveProjectModalOpen).toBe(false)
		expect(mocks.moveRecycleBinProject).not.toHaveBeenCalled()

		await act(async () => {
			await result.current.actions.handleConfirmRestore()
		})

		expect(mocks.restoreRecycleBinResources).toHaveBeenCalledWith({
			resource_ids: ["app-1"],
			resource_type: RESOURCE_TYPE.MICRO_APP,
		})
		expect(result.current.items).toEqual([])
	})
})
