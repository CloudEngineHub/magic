import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { RouteName } from "@/routes/constants"

const { storeMock, groupsServiceMock, navigateMock, superMagicServiceMock } = vi.hoisted(() => ({
	storeMock: {
		list: [] as unknown[],
		optimisticItems: [],
		summaryFilter: "all",
		createdAtStart: undefined as number | undefined,
		createdAtEnd: undefined as number | undefined,
		sortBy: "updated_at" as const,
		sortOrder: "desc" as const,
		loading: false,
		loadingMore: false,
		hasMore: false,
		showInitialSkeleton: false,
		registerPollerCallbacks: vi.fn(),
		disposePoller: vi.fn(),
		reset: vi.fn(),
		hydrateFiltersFromSession: vi.fn(),
		fetchList: vi.fn(),
		loadMore: vi.fn(),
		setSummaryFilter: vi.fn(),
		setDateRange: vi.fn(),
		setSort: vi.fn(),
		setWorkspaceId: vi.fn(),
		isSubmittingAction: vi.fn(() => false),
		isSubmittingSummary: vi.fn(() => false),
	},
	groupsServiceMock: {
		listGroups: vi.fn(),
		createGroup: vi.fn(),
		renameGroup: vi.fn(),
		deleteGroup: vi.fn(),
	},
	navigateMock: vi.fn(),
	superMagicServiceMock: {
		initializeState: vi.fn(),
	},
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				pageTitle: "Recordings",
				"filters.summaryStatus": "Summary status",
				"filters.summaryAll": "All",
				"filters.summaryNotDone": "Not summarized",
				"filters.summaryDone": "Summarized",
				"super:mobile.recordingEntry.filterSheet.dateRange.label": "Date range",
				"super:mobile.recordingEntry.filterSheet.dateRange.all": "All time",
				"super:mobile.recordingEntry.filterSheet.dateRange.today": "Today",
				"super:mobile.recordingEntry.filterSheet.dateRange.week": "Last 7 days",
				"super:mobile.recordingEntry.filterSheet.dateRange.month": "Last 30 days",
				"filters.sort": "Sort",
				"filters.sortByUpdatedDesc": "By last updated",
				"filters.sortByCreatedDesc": "By created time",
				searchPlaceholder: "Search recordings",
				searchClear: "Clear search",
				refresh: "Refresh",
				loading: "Loading",
				loadingMore: "Loading more",
				end: "End",
				"empty.title": "No recordings",
				"empty.description": "No data",
				"empty.search": "No search data",
				"super:mobile.recordingEntry.groupSheet.all": "All",
				"super:mobile.recordingEntry.groupSheet.ungrouped": "Ungrouped",
				"super:mobile.recordingEntry.groupSheet.manageGroups": "Manage groups",
				"super:mobile.recordingEntry.groupSheet.unnamedGroup": "Unnamed group",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	getAdminLocaleModules: () => ({ adminZhCNModules: {}, adminEnUSModules: {} }),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => navigateMock,
}))

vi.mock("@/models/config/stores/theme.store", () => ({
	// This page test only exercises recording filters, so avoid storage-backed theme setup.
	themeStore: {
		theme: "light",
	},
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuItem: ({
		children,
		onClick,
		"data-testid": dataTestId,
	}: {
		children: ReactNode
		onClick?: () => void
		"data-testid"?: string
	}) => (
		<button type="button" data-testid={dataTestId} onClick={onClick}>
			{children}
		</button>
	),
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: superMagicServiceMock,
}))

vi.mock("@/pages/superMagic/hooks/useAutoLoadMoreSentinel", () => ({
	useAutoLoadMoreSentinel: () => vi.fn(),
}))

vi.mock("../hooks/useRecordingEntryFacade", () => ({
	useRecordingEntryFacade: () => ({
		optimisticItems: [],
		clearOptimisticItem: vi.fn(),
		importAudioFiles: vi.fn(),
		startRecording: vi.fn(),
		startupState: "idle",
		retryImport: vi.fn(),
	}),
}))

vi.mock("../hooks/useAudioRecordingsOptimisticSync", () => ({
	useAudioRecordingsOptimisticSync: ({ storeList }: { storeList: unknown[] }) => storeList,
}))

vi.mock("../hooks/useAudioRecordingCopyToProject", () => ({
	useAudioRecordingCopyToProject: () => ({
		visible: false,
		copyTarget: null,
		sourceAttachments: [],
		sourceFileIds: [],
		workspaces: [],
		folderConflictModalVisible: false,
		duplicateModalVisible: false,
		isPreparing: false,
		isOperating: false,
		operationProgress: 0,
		openCopyToProject: vi.fn(),
		closeCopyDialog: vi.fn(),
		submitCopy: vi.fn(),
	}),
}))

vi.mock("../stores/audio-recordings-store", () => ({
	audioRecordingsStore: storeMock,
}))

vi.mock("@/services/audioRecordings", () => ({
	ALL_RECORDING_GROUP_ID: "-1",
	UNGROUPED_RECORDING_GROUP_ID: "",
	recordingGroupsService: groupsServiceMock,
	audioRecordingsService: {
		batchMoveProjects: vi.fn(),
	},
}))

vi.mock("../utils/request-audio-recordings-shell-refresh", () => ({
	registerAudioRecordingsShellRefreshHandler: vi.fn(() => vi.fn()),
}))

vi.mock("../components/AudioRecordingsPrimaryActions", () => ({
	AudioRecordingsPrimaryActions: () => <div data-testid="mock-primary-actions" />,
}))

vi.mock("../components/AudioRecordingRenameDialog", () => ({
	AudioRecordingRenameDialog: () => null,
}))

vi.mock("../components/AudioRecordingDeleteDialog", () => ({
	AudioRecordingDeleteDialog: () => null,
}))

vi.mock("../components/AudioRecordingGroupDialogs", () => ({
	AudioRecordingGroupManageDialog: ({
		onCreateGroup,
	}: {
		onCreateGroup: (name: string) => Promise<unknown>
	}) => (
		<button
			type="button"
			data-testid="mock-create-group-from-manage"
			onClick={() => void onCreateGroup("Mock created group")}
		>
			Create group
		</button>
	),
	AudioRecordingMoveGroupDialog: () => null,
}))

vi.mock("../components/AudioRecordingSettingsDialog", () => ({
	AudioRecordingSettingsDialog: () => null,
}))

vi.mock("../components/AudioRecordingCopyDialog", () => ({
	AudioRecordingCopyDialog: () => null,
}))

import AudioRecordingsDesktop from "../AudioRecordingsDesktop"
import { AUDIO_RECORDINGS_FILTER_SESSION_KEY } from "../utils/audio-recordings-filter-session"

/** Exercises desktop session persistence at the page level without relying on backend data. */
describe("AudioRecordingsDesktop", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		sessionStorage.clear()
		groupsServiceMock.listGroups.mockResolvedValue({
			groups: [
				{
					id: "mock-group-id",
					name: "Mock group",
					projectCount: 2,
					isVirtual: false,
				},
			],
			totalCount: 2,
			ungroupedCount: 0,
		})
		storeMock.summaryFilter = "all"
		storeMock.sortBy = "updated_at"
		storeMock.sortOrder = "desc"
		storeMock.createdAtStart = undefined
		storeMock.createdAtEnd = undefined
		storeMock.list = []
		superMagicServiceMock.initializeState.mockResolvedValue(undefined)
	})

	it("initializes the recording project before navigating to its project route", async () => {
		let resolveInitialization: () => void = () => undefined
		superMagicServiceMock.initializeState.mockReturnValue(
			new Promise<void>((resolve) => {
				resolveInitialization = resolve
			}),
		)
		storeMock.list = [
			{
				id: "mock-recording-project-id",
				project_name: "Mock recording",
				card_status: "summarized",
				is_summarized: true,
				created_at: 1710000000,
				duration: 120,
				tags: [],
				audio_source: "recorded",
				current_phase: "summarizing",
				phase_status: "completed",
			},
		]

		render(<AudioRecordingsDesktop />)

		const trigger = await screen.findByTestId(
			"audio-recording-card-mock-recording-project-id-more-actions",
		)
		trigger.focus()
		fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" })
		fireEvent.click(
			screen.getByTestId(
				"audio-recording-card-mock-recording-project-id-action-open-project",
			),
		)

		expect(superMagicServiceMock.initializeState).toHaveBeenCalledWith({
			projectId: "mock-recording-project-id",
		})
		expect(navigateMock).not.toHaveBeenCalled()

		resolveInitialization()
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalledWith({
				name: RouteName.SuperWorkspaceProjectState,
				params: { projectId: "mock-recording-project-id" },
			})
		})
	})

	it("persists desktop summary filter changes to sessionStorage", async () => {
		render(<AudioRecordingsDesktop />)

		await waitFor(() => {
			expect(storeMock.hydrateFiltersFromSession).toHaveBeenCalled()
		})

		fireEvent.click(screen.getByTestId("audio-recordings-summary-not_summarized"))

		expect(storeMock.setSummaryFilter).toHaveBeenCalledWith("not_summarized")
		expect(
			JSON.parse(sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}"),
		).toMatchObject({
			summaryFilter: "not_summarized",
		})
	})

	it("renders the default empty state without secondary description copy", async () => {
		render(<AudioRecordingsDesktop />)

		await waitFor(() => {
			expect(screen.getByTestId("audio-recordings-group-filter-trigger")).toHaveTextContent(
				"2",
			)
		})

		expect(screen.getByTestId("audio-recordings-empty")).toBeInTheDocument()
		expect(screen.getByText("No recordings")).toBeInTheDocument()
		expect(screen.queryByText("No data")).toBeNull()
	})

	it("keeps the search empty state explanation when keyword filtering has no result", async () => {
		render(<AudioRecordingsDesktop />)

		fireEvent.change(screen.getByPlaceholderText("Search recordings"), {
			target: { value: "missing recording" },
		})

		await waitFor(() => {
			expect(screen.getByText("No search data")).toBeInTheDocument()
		})
	})

	it("resets a stale persisted group id after group metadata loads", async () => {
		sessionStorage.setItem(
			AUDIO_RECORDINGS_FILTER_SESSION_KEY,
			JSON.stringify({
				summaryFilter: "all",
				datePreset: "all",
				sortBy: "updated_at",
				sortOrder: "desc",
				searchKeyword: "",
				groupId: "mock-stale-group-id",
			}),
		)

		render(<AudioRecordingsDesktop />)

		await waitFor(() => {
			expect(storeMock.setWorkspaceId).toHaveBeenCalledWith("-1")
		})

		expect(
			JSON.parse(sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}"),
		).toMatchObject({
			groupId: "-1",
		})
		expect(screen.getByTestId("audio-recordings-group-filter-trigger")).toHaveTextContent("All")
	})

	it("keeps the newly created group selected after refreshing group metadata", async () => {
		let resolveCreatedGroups: (value: unknown) => void = () => undefined
		const createdGroupsPromise = new Promise((resolve) => {
			resolveCreatedGroups = resolve
		})
		groupsServiceMock.createGroup.mockResolvedValue({
			id: "mock-created-group-id",
			name: "Mock created group",
			projectCount: 0,
			isVirtual: false,
		})
		groupsServiceMock.listGroups
			.mockResolvedValueOnce({
				groups: [
					{
						id: "mock-group-id",
						name: "Mock group",
						projectCount: 2,
						isVirtual: false,
					},
				],
				totalCount: 2,
				ungroupedCount: 0,
			})
			.mockReturnValueOnce(createdGroupsPromise)

		render(<AudioRecordingsDesktop />)

		await waitFor(() => {
			expect(screen.getByTestId("audio-recordings-group-filter-trigger")).toHaveTextContent(
				"2",
			)
		})

		fireEvent.click(screen.getByTestId("mock-create-group-from-manage"))

		await waitFor(() => {
			expect(groupsServiceMock.createGroup).toHaveBeenCalledWith("Mock created group")
		})
		await new Promise((resolve) => {
			setTimeout(resolve, 0)
		})

		resolveCreatedGroups({
			groups: [
				{
					id: "mock-group-id",
					name: "Mock group",
					projectCount: 2,
					isVirtual: false,
				},
				{
					id: "mock-created-group-id",
					name: "Mock created group",
					projectCount: 0,
					isVirtual: false,
				},
			],
			totalCount: 2,
			ungroupedCount: 0,
		})

		await waitFor(() => {
			expect(
				JSON.parse(sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY) ?? "{}"),
			).toMatchObject({
				groupId: "mock-created-group-id",
			})
		})
		expect(storeMock.setWorkspaceId).toHaveBeenLastCalledWith("mock-created-group-id")
	})
})
