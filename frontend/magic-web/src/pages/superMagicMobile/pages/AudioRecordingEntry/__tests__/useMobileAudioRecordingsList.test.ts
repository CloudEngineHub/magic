import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { audioRecordingsStore } from "@/pages/superMagic/pages/AudioRecordings/stores/audio-recordings-store"

const ALL_RECORDING_GROUP_ID = "-1"

const { serviceMocks } = vi.hoisted(() => ({
	serviceMocks: {
		queryProjects: vi.fn(),
		batchMoveProjects: vi.fn(),
		listGroups: vi.fn(),
		createGroup: vi.fn(),
		renameGroup: vi.fn(),
		deleteGroup: vi.fn(),
	},
}))

// Block barrel-transitive imports (recordingOrigin -> history -> i18n glob) during Vitest collect.
vi.mock("@/routes/history", () => ({
	history: {
		createHref: vi.fn(),
		push: vi.fn(),
		go: vi.fn(),
		replace: vi.fn(),
	},
	baseHistory: {
		listen: vi.fn(() => vi.fn()),
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	getAdminLocaleModules: () => ({ adminZhCNModules: {}, adminEnUSModules: {} }),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		queryAudioProjects: vi.fn(),
	},
}))

vi.mock("@/services/audioRecordings/AudioRecordingsService", () => ({
	audioRecordingsService: {
		queryProjects: serviceMocks.queryProjects,
		batchMoveProjects: serviceMocks.batchMoveProjects,
	},
}))

vi.mock("@/services/audioRecordings/RecordingGroupsService", () => ({
	recordingGroupsService: {
		listGroups: serviceMocks.listGroups,
		createGroup: serviceMocks.createGroup,
		renameGroup: serviceMocks.renameGroup,
		deleteGroup: serviceMocks.deleteGroup,
	},
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/services/summary-progress-poller", () => ({
	summaryProgressPoller: {
		addTask: vi.fn(),
		dispose: vi.fn(),
		setCallbacks: vi.fn(),
	},
}))

import { useMobileAudioRecordingsList } from "../hooks/useMobileAudioRecordingsList"
import {
	AUDIO_RECORDINGS_FILTER_SESSION_KEY,
	DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-filter-session"

describe("useMobileAudioRecordingsList", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		sessionStorage.clear()
		serviceMocks.queryProjects.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 20 })
		serviceMocks.listGroups.mockResolvedValue({
			groups: [
				{
					id: "workspace-audio-001",
					name: "Mock work group",
					projectCount: 3,
					isVirtual: false,
				},
			],
			totalCount: 4,
			ungroupedCount: 1,
		})
	})

	afterEach(() => {
		audioRecordingsStore.disposePoller()
		audioRecordingsStore.reset()
		sessionStorage.clear()
	})

	it("restores persisted mobile list filters before the first query", async () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				summaryFilter: "summarized",
				datePreset: "month",
				sortBy: "created_at",
				sortOrder: "desc",
				searchKeyword: "mock mobile keyword",
				groupId: "workspace-audio-001",
			}),
		)

		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(serviceMocks.queryProjects).toHaveBeenCalledWith(
				expect.objectContaining({
					summaryFilter: "summarized",
					sortBy: "created_at",
					sortOrder: "desc",
					workspaceId: "workspace-audio-001",
					keyword: "mock mobile keyword",
				}),
			)
		})
		expect(result.current.searchKeyword).toBe("mock mobile keyword")
		expect(result.current.searchOpen).toBe(true)
		expect(result.current.filterState).toEqual({
			datePreset: "month",
			sortOption: "created_at_desc",
		})
		expect(result.current.currentGroupId).toBe("workspace-audio-001")
	})

	it("persists mobile filter and group changes to the shared session snapshot", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(serviceMocks.listGroups).toHaveBeenCalled()
		})

		act(() => {
			result.current.handleSummaryFilterChange("not_summarized")
			result.current.handleFilterStateChange({
				datePreset: "week",
				sortOption: "created_at_desc",
			})
			result.current.handleGroupChange("workspace-audio-001")
		})

		const saved = JSON.parse(
			sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}",
		)
		expect(saved).toMatchObject({
			summaryFilter: "not_summarized",
			datePreset: "week",
			sortBy: "created_at",
			sortOrder: "desc",
			groupId: "workspace-audio-001",
		})
	})

	it("persists clearing the mobile search keyword when dismissing search", async () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				...DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION,
				searchKeyword: "mock stale search",
			}),
		)
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(serviceMocks.listGroups).toHaveBeenCalled()
		})

		act(() => {
			result.current.handleDismissSearch()
		})

		const saved = JSON.parse(
			sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}",
		)
		expect(saved.searchKeyword).toBe("")
	})

	it("loads groups and refetches list for the selected group", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(1)
		})

		act(() => {
			result.current.handleGroupChange("workspace-audio-001")
		})

		await waitFor(() => {
			expect(serviceMocks.queryProjects).toHaveBeenLastCalledWith(
				expect.objectContaining({
					workspaceId: "workspace-audio-001",
				}),
			)
		})
		expect(result.current.currentGroupLabel).toBe("Mock work group")
		expect(result.current.currentGroupCount).toBe(3)
	})

	it("resets a stale persisted group id after mobile group metadata loads", async () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				summaryFilter: "all",
				datePreset: "all",
				sortBy: "updated_at",
				sortOrder: "desc",
				searchKeyword: "",
				groupId: "workspace-audio-stale",
			}),
		)

		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.currentGroupId).toBe(ALL_RECORDING_GROUP_ID)
		})

		await waitFor(() => {
			expect(serviceMocks.queryProjects).toHaveBeenLastCalledWith(
				expect.objectContaining({
					workspaceId: ALL_RECORDING_GROUP_ID,
				}),
			)
		})
		expect(
			JSON.parse(sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}"),
		).toMatchObject({
			groupId: ALL_RECORDING_GROUP_ID,
		})
	})

	it("keeps empty group names in currentGroupLabel for toolbar fallback rendering", async () => {
		serviceMocks.listGroups.mockResolvedValue({
			groups: [
				{
					id: "workspace-audio-empty",
					name: "",
					projectCount: 2,
					isVirtual: false,
				},
			],
			totalCount: 2,
			ungroupedCount: 0,
		})

		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(1)
		})

		act(() => {
			result.current.handleGroupChange("workspace-audio-empty")
		})

		expect(result.current.currentGroupLabel).toBe("")
	})

	it("moves a recording then refreshes groups and current list", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		act(() => {
			result.current.handleOpenMoveGroup({
				id: "project-move-001",
				project_name: "Mock move item",
				created_at: 1710000000,
				duration: 60,
				tags: [],
				device_id: "",
				audio_source: "recorded",
				current_phase: "summarizing",
				phase_status: "completed",
				card_status: "summarized",
				is_summarized: true,
			})
		})

		await act(async () => {
			await result.current.handleMoveGroupChange("")
		})

		expect(serviceMocks.batchMoveProjects).toHaveBeenCalledWith(["project-move-001"], "")
		expect(serviceMocks.listGroups).toHaveBeenCalled()
		expect(serviceMocks.queryProjects).toHaveBeenCalled()
	})

	it("refreshes group counts together with the recording list", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(serviceMocks.listGroups).toHaveBeenCalledTimes(1)
		})

		serviceMocks.listGroups.mockClear()
		serviceMocks.queryProjects.mockClear()

		await act(async () => {
			await result.current.handleRefresh()
		})

		expect(serviceMocks.listGroups).toHaveBeenCalledTimes(1)
		expect(serviceMocks.queryProjects).toHaveBeenCalledTimes(1)
	})

	it("settles group loading when group refresh fails", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(serviceMocks.listGroups).toHaveBeenCalled()
		})

		serviceMocks.listGroups.mockRejectedValueOnce(new Error("mock group refresh failure"))
		let refreshed = true
		await act(async () => {
			refreshed = await result.current.refreshGroups()
		})

		expect(refreshed).toBe(false)
		expect(result.current.groupsLoading).toBe(false)
	})

	it("creates a group without switching the active filter", async () => {
		serviceMocks.createGroup.mockResolvedValue({
			id: "workspace-audio-new",
			name: "Mock new group",
			projectCount: 0,
			isVirtual: false,
		})

		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(1)
		})

		act(() => {
			result.current.handleGroupChange("workspace-audio-001")
		})

		await act(async () => {
			await result.current.handleCreateGroup("Mock new group")
		})

		expect(serviceMocks.createGroup).toHaveBeenCalledWith("Mock new group")
		expect(result.current.currentGroupId).toBe("workspace-audio-001")
		expect(serviceMocks.listGroups).toHaveBeenCalledTimes(2)
	})

	it("renames a group and refreshes group metadata", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(1)
		})

		await act(async () => {
			await result.current.handleRenameGroup("workspace-audio-001", "Mock renamed group")
		})

		expect(serviceMocks.renameGroup).toHaveBeenCalledWith(
			"workspace-audio-001",
			"Mock renamed group",
		)
		expect(serviceMocks.listGroups).toHaveBeenCalledTimes(2)
		expect(result.current.groupActionSubmitting).toBe(false)
	})

	it("resets to all when deleting the active group", async () => {
		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(1)
		})

		act(() => {
			result.current.handleGroupChange("workspace-audio-001")
		})

		await act(async () => {
			await result.current.handleDeleteGroup("workspace-audio-001")
		})

		expect(serviceMocks.deleteGroup).toHaveBeenCalledWith("workspace-audio-001")
		expect(result.current.currentGroupId).toBe(ALL_RECORDING_GROUP_ID)
		expect(serviceMocks.queryProjects).toHaveBeenCalled()
	})

	it("keeps the active filter when deleting a non-active group", async () => {
		serviceMocks.listGroups.mockResolvedValue({
			groups: [
				{
					id: "workspace-audio-001",
					name: "Mock work group",
					projectCount: 3,
					isVirtual: false,
				},
				{
					id: "workspace-audio-002",
					name: "Mock meeting group",
					projectCount: 2,
					isVirtual: false,
				},
			],
			totalCount: 5,
			ungroupedCount: 0,
		})

		const { result } = renderHook(() => useMobileAudioRecordingsList())

		await waitFor(() => {
			expect(result.current.groups).toHaveLength(2)
		})

		act(() => {
			result.current.handleGroupChange("workspace-audio-001")
		})

		await act(async () => {
			await result.current.handleDeleteGroup("workspace-audio-002")
		})

		expect(serviceMocks.deleteGroup).toHaveBeenCalledWith("workspace-audio-002")
		expect(result.current.currentGroupId).toBe("workspace-audio-001")
	})
})
