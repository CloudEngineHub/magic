import { useState } from "react"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RecycleBinItemData } from "../../components/RecycleBinItem"
import { RESOURCE_TYPE } from "../mobileRecycleBinMappers"
import { useMobileRecycleBinRestoreFlow } from "../useMobileRecycleBinRestoreFlow"

const mocks = vi.hoisted(() => ({
	checkRecycleBinParent: vi.fn(),
	restoreRecycleBinResources: vi.fn(),
	moveRecycleBinProject: vi.fn(),
	fetchWorkspaces: vi.fn(),
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

vi.mock("@/routes/history", () => ({
	baseHistory: { replace: vi.fn() },
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		workspace: { fetchWorkspaces: mocks.fetchWorkspaces },
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	workspaceStore: { workspaces: [] },
	projectStore: {
		getProjectsByWorkspace: () => [],
		loadProjectsForWorkspace: vi.fn(),
	},
}))

const microAppItem: RecycleBinItemData = {
	id: "trash-1",
	type: "microApp",
	title: "客户跟进助手",
	deletedAt: "2026-08-04 12:00:00",
	validDays: 30,
	resourceId: "app-1",
	resourceType: RESOURCE_TYPE.MICRO_APP,
	selected: false,
	path: "微应用",
}

describe("useMobileRecycleBinRestoreFlow micro app restore", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.fetchWorkspaces.mockResolvedValue(undefined)
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

	it("uses the normal confirmation and restores by app_id", async () => {
		const run = vi.fn()
		const queryParams = { order: "desc" as const, page: 1, page_size: 50 }
		const { result } = renderHook(() => {
			const [items, setItems] = useState([microAppItem])
			const [selectedIds, setSelectedIds] = useState<string[]>([])
			const flow = useMobileRecycleBinRestoreFlow({
				items,
				setItems,
				selectedIds,
				setSelectedIds,
				queryParams,
				run,
			})
			return { flow, items }
		})

		await act(async () => {
			await result.current.flow.requestRestoreSingle("trash-1")
		})

		expect(result.current.flow.restoreConfirmOpen).toBe(true)
		expect(result.current.flow.restorePickerOpen).toBe(false)
		expect(result.current.flow.moveProjectModalOpen).toBe(false)
		expect(mocks.moveRecycleBinProject).not.toHaveBeenCalled()

		await act(async () => {
			await result.current.flow.confirmRestore()
		})

		expect(mocks.restoreRecycleBinResources).toHaveBeenCalledWith({
			resource_ids: ["app-1"],
			resource_type: RESOURCE_TYPE.MICRO_APP,
		})
		expect(result.current.items).toEqual([])
	})
})
