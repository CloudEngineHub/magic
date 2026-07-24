import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { RouteName } from "@/routes/constants"

const mockStore = {
	list: [] as AudioProjectListItem[],
	summaryFilter: "all" as const,
	showInitialSkeleton: false,
	isEmpty: true,
	hasMore: false,
	loading: false,
	loadingMore: false,
	isSubmittingSummary: vi.fn(() => false),
	isSubmittingAction: vi.fn(() => false),
	submitSummary: vi.fn(),
	renameProject: vi.fn(),
	deleteProject: vi.fn(),
}

const listHookState = {
	moreTarget: null as AudioProjectListItem | null,
	handleCloseMore: vi.fn(),
	handleOpenMore: vi.fn(),
}

const getAttachmentsByProjectIdMock = vi.fn()
const processAttachmentDataMock = vi.fn()
const setExternallyHiddenMock = vi.fn()
const setExpandedMock = vi.fn()
const navigateMock = vi.fn()
let intersectionObserverCallback: IntersectionObserverCallback | null = null

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => navigateMock,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getAttachmentsByProjectId: (...args: unknown[]) => getAttachmentsByProjectIdMock(...args),
	},
}))

vi.mock("@/pages/superMagic/utils/attachmentDataProcessor", () => ({
	AttachmentDataProcessor: {
		processAttachmentData: (...args: unknown[]) => processAttachmentDataMock(...args),
	},
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils", () => ({
	isAudioProjectPreviewReady: () => true,
	resolveRecordingDisplayName: (name: string) => name,
}))

vi.mock("@/stores/recordingSummary", () => ({
	__esModule: true,
	default: {
		floatPanel: {
			setExternallyHidden: (...args: unknown[]) => setExternallyHiddenMock(...args),
			setExpanded: (...args: unknown[]) => setExpandedMock(...args),
		},
	},
}))

vi.mock("antd-mobile", () => ({
	InfiniteScroll: () => <div data-testid="mobile-recording-infinite-scroll" />,
}))

vi.mock("@/components/base-mobile/MagicPullToRefresh", () => ({
	default: ({
		children,
		containerClassName,
	}: {
		children: React.ReactNode
		containerClassName?: string
	}) => (
		<div data-testid="mock-pull-to-refresh" data-container-class={containerClassName}>
			{children}
		</div>
	),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/shadcn-ui/sheet", () => ({
	Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
		open ? <div data-testid="mock-sheet">{children}</div> : null,
	SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
		visible ? <div data-testid="mock-magic-popup">{children}</div> : null,
}))

vi.mock("@/pages/superMagicMobile/components/MobileDeleteConfirmPopup", () => ({
	default: () => null,
}))

vi.mock("../components/MobileRecordingCard", () => ({
	MobileRecordingCard: ({ item }: { item: AudioProjectListItem }) => (
		<div data-testid={`mobile-recording-card-${item.id}`} data-duration={String(item.duration)}>
			{item.project_name}
		</div>
	),
}))

vi.mock("../components/MobileRecordingMoreSheet", () => ({
	MobileRecordingMoreSheet: ({
		isOpen,
		onOpenProject,
		onShare,
		onDelete,
		item,
	}: {
		isOpen: boolean
		onOpenProject?: (item: AudioProjectListItem) => void
		onShare?: () => void
		onDelete?: (projectId: string) => Promise<boolean>
		item?: AudioProjectListItem | null
	}) =>
		isOpen ? (
			<div>
				<button
					type="button"
					data-testid="mobile-recording-more-open-project"
					onClick={() => item && onOpenProject?.(item)}
				>
					Open project
				</button>
				<button type="button" data-testid="mobile-recording-more-share" onClick={onShare}>
					Share
				</button>
				<button
					type="button"
					data-testid="mobile-recording-more-delete"
					onClick={() => void onDelete?.(item?.id || "")}
				>
					Delete
				</button>
			</div>
		) : null,
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/hooks/useAudioRecordingCopyToProject", () => ({
	useAudioRecordingCopyToProject: () => ({
		openCopyToProject: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/components/AudioRecordingCopyDialog", () => ({
	AudioRecordingCopyDialog: () => null,
}))

vi.mock("../components/MobileRecordingFilterSheet", () => ({
	MobileRecordingFilterSheet: () => null,
}))

vi.mock("../components/MobileRecordingImportSheet", () => ({
	MobileRecordingImportSheet: () => null,
}))

vi.mock("../components/MobileRecordingFab", () => ({
	MobileRecordingFab: () => <div data-testid="mobile-recording-fab" />,
}))

vi.mock("@/pages/superMagicMobile/components/ProjectShareSheet", () => ({
	__esModule: true,
	default: ({ open, projectId }: { open: boolean; projectId?: string }) =>
		open ? <div data-testid={`project-share-sheet-${projectId || "unknown"}`} /> : null,
}))

vi.mock("../hooks/useMobileAudioRecordingsList", () => ({
	useMobileAudioRecordingsList: () => ({
		store: mockStore,
		searchKeyword: "",
		setSearchKeyword: vi.fn(),
		setIsSearchComposing: vi.fn(),
		searchOpen: false,
		filterState: { datePreset: "all", sortOption: "updated_at_desc" },
		filterSheetOpen: false,
		setFilterSheetOpen: vi.fn(),
		importSheetOpen: false,
		setImportSheetOpen: vi.fn(),
		groupSheetOpen: false,
		setGroupSheetOpen: vi.fn(),
		moveGroupSheetOpen: false,
		setMoveGroupSheetOpen: vi.fn(),
		moveTarget: null,
		groups: [],
		totalGroupCount: 0,
		ungroupedCount: 0,
		currentGroupId: "-1",
		currentGroupLabel: "all",
		currentGroupCount: 0,
		groupsLoading: false,
		groupActionSubmitting: false,
		activeFilterCount: 0,
		debouncedKeyword: "",
		moreTarget: listHookState.moreTarget,
		handleRefresh: vi.fn(),
		handleLoadMore: vi.fn(),
		handleSummaryFilterChange: vi.fn(),
		handleFilterStateChange: vi.fn(),
		handleOpenSearch: vi.fn(),
		handleDismissSearch: vi.fn(),
		handleOpenMore: listHookState.handleOpenMore,
		handleCloseMore: listHookState.handleCloseMore,
		handleGroupChange: vi.fn(),
		handleCreateGroup: vi.fn(),
		handleRenameGroup: vi.fn(),
		handleDeleteGroup: vi.fn(),
		handleOpenMoveGroup: vi.fn(),
		handleMoveGroupChange: vi.fn(),
		refreshGroups: vi.fn(),
	}),
}))

import AudioRecordingListPanel from "../AudioRecordingListPanel"

describe("AudioRecordingListPanel", () => {
	const listItem = {
		id: "proj-alpha-001",
		project_name: "Demo meeting notes",
		created_at: 1710000000,
		duration: 120,
		tags: [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		card_status: "summarized",
		is_summarized: true,
	} satisfies AudioProjectListItem

	beforeEach(() => {
		listHookState.moreTarget = null
		listHookState.handleCloseMore.mockReset()
		listHookState.handleOpenMore.mockReset()
		getAttachmentsByProjectIdMock.mockReset()
		processAttachmentDataMock.mockReset()
		setExternallyHiddenMock.mockReset()
		setExpandedMock.mockReset()
		navigateMock.mockReset()
		intersectionObserverCallback = null

		vi.stubGlobal(
			"IntersectionObserver",
			vi.fn((callback: IntersectionObserverCallback) => {
				intersectionObserverCallback = callback
				return {
					observe: vi.fn(),
					unobserve: vi.fn(),
					disconnect: vi.fn(),
					takeRecords: vi.fn(() => []),
				}
			}),
		)
	})

	it("renders toolbar and recording empty state when list is empty", () => {
		mockStore.list = []
		mockStore.isEmpty = true
		mockStore.showInitialSkeleton = false

		render(<AudioRecordingListPanel />)

		expect(screen.getByTestId("mobile-audio-recording-list-panel")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-toolbar")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-list-empty-state")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-list-empty-state")).toHaveClass(
			"flex-1",
			"py-0",
		)
		expect(screen.getByTestId("mock-pull-to-refresh")).toHaveAttribute(
			"data-container-class",
			expect.stringContaining("!overflow-hidden"),
		)
		expect(screen.getByTestId("mock-pull-to-refresh")).toHaveAttribute(
			"data-container-class",
			expect.stringContaining("h-full"),
		)
	})

	it("renders skeleton during initial loading", () => {
		mockStore.showInitialSkeleton = true
		mockStore.isEmpty = true

		render(<AudioRecordingListPanel />)

		expect(screen.getByTestId("mobile-recording-list-skeleton")).toBeInTheDocument()
	})

	it("renders cards when list has items", () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [listItem]

		render(<AudioRecordingListPanel />)

		expect(screen.getByTestId("mobile-recording-card-list")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-card-proj-alpha-001")).toBeInTheDocument()
	})

	it("resolves optimistic items once the authoritative list contains the same project", async () => {
		const onResolveOptimisticItem = vi.fn()
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [
			{
				id: "proj-imported-001",
				project_name: "Imported audio result",
				created_at: 1710000001,
				duration: 61,
				tags: [],
				device_id: "",
				audio_source: "imported",
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				is_summarized: false,
			},
		]

		render(
			<AudioRecordingListPanel
				optimisticItems={[
					{
						id: "proj-imported-001",
						project_name: "Imported audio result",
						created_at: 1710000001,
						duration: 0,
						tags: [],
						device_id: "",
						audio_source: "imported",
						current_phase: "summarizing",
						phase_status: "in_progress",
						card_status: "summarizing",
						is_summarized: false,
					},
				]}
				onResolveOptimisticItem={onResolveOptimisticItem}
			/>,
		)

		await waitFor(() => {
			expect(onResolveOptimisticItem).toHaveBeenCalledWith("proj-imported-001")
		})
	})

	it("replaces optimistic duration with the authoritative row when the local item is not uploading", async () => {
		// Per issue 录音状态核对.md, non-uploading optimistic items are directly replaced by the
		// authoritative backend row — even when the backend summarizing row still reports zero duration.
		const onResolveOptimisticItem = vi.fn()
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [
			{
				id: "proj-recorded-001",
				project_name: "Recorded result",
				created_at: 1710000002,
				duration: 0,
				tags: [],
				device_id: "",
				audio_source: "recorded",
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				is_summarized: false,
			},
		]

		render(
			<AudioRecordingListPanel
				optimisticItems={[
					{
						id: "proj-recorded-001",
						project_name: "Recorded result",
						created_at: 1710000002,
						duration: 754,
						tags: [],
						device_id: "",
						audio_source: "recorded",
						current_phase: "summarizing",
						phase_status: "in_progress",
						card_status: "summarizing",
						is_summarized: false,
					},
				]}
				onResolveOptimisticItem={onResolveOptimisticItem}
			/>,
		)

		// The optimistic item is cleared so the backend row (duration=0) takes over.
		await waitFor(() => {
			expect(onResolveOptimisticItem).toHaveBeenCalledWith("proj-recorded-001")
		})
	})

	it("does not resolve an optimistic item that is still uploading", () => {
		// Upload-in-flight optimistic items must stay visible even when the backend already returns
		// a row for the same project, otherwise the progress bar / retry UI disappears prematurely.
		const onResolveOptimisticItem = vi.fn()
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [
			{
				id: "proj-importing-001",
				project_name: "Importing audio",
				created_at: 1710000003,
				duration: 0,
				tags: [],
				device_id: "",
				audio_source: "imported",
				current_phase: "merging",
				phase_status: "completed",
				card_status: "not_summarized",
				is_summarized: false,
			},
		]

		render(
			<AudioRecordingListPanel
				optimisticItems={[
					{
						id: "proj-importing-001",
						project_name: "Importing audio",
						created_at: 1710000003,
						duration: 0,
						tags: [],
						device_id: "",
						audio_source: "imported",
						current_phase: "summarizing",
						phase_status: "in_progress",
						card_status: "uploading",
						is_summarized: false,
						transferStatus: "transferring",
						transferProgress: 0.42,
					},
				]}
				onResolveOptimisticItem={onResolveOptimisticItem}
			/>,
		)

		expect(onResolveOptimisticItem).not.toHaveBeenCalled()
	})

	it("keeps summarizing optimistic card visible when authoritative row is still not_summarized", () => {
		const onResolveOptimisticItem = vi.fn()
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [
			{
				id: "proj-auto-summary-001",
				project_name: "Auto summary imported",
				created_at: 1710000004,
				duration: 0,
				tags: [],
				device_id: "",
				audio_source: "imported",
				current_phase: "merging",
				phase_status: "completed",
				card_status: "not_summarized",
				is_summarized: false,
			},
		]

		render(
			<AudioRecordingListPanel
				optimisticItems={[
					{
						id: "proj-auto-summary-001",
						project_name: "Auto summary imported",
						created_at: 1710000004,
						duration: 0,
						tags: [],
						device_id: "",
						audio_source: "imported",
						current_phase: "summarizing",
						phase_status: "in_progress",
						card_status: "summarizing",
						is_summarized: false,
					},
				]}
				onResolveOptimisticItem={onResolveOptimisticItem}
			/>,
		)

		expect(screen.getByTestId("mobile-recording-card-proj-auto-summary-001")).toHaveAttribute(
			"data-duration",
			"0",
		)
		expect(onResolveOptimisticItem).not.toHaveBeenCalled()
	})

	it("clears the matching optimistic item after a successful delete", async () => {
		const onResolveOptimisticItem = vi.fn()
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [listItem]
		mockStore.deleteProject.mockResolvedValue(true)
		listHookState.moreTarget = listItem

		render(
			<AudioRecordingListPanel
				optimisticItems={[listItem]}
				onResolveOptimisticItem={onResolveOptimisticItem}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-more-delete"))

		await waitFor(() => {
			expect(mockStore.deleteProject).toHaveBeenCalledWith("proj-alpha-001")
		})
		expect(onResolveOptimisticItem).toHaveBeenCalledWith("proj-alpha-001")
	})

	it("navigates from the mobile more-actions sheet to the recording project route", () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [listItem]
		listHookState.moreTarget = listItem

		render(<AudioRecordingListPanel />)

		fireEvent.click(screen.getByTestId("mobile-recording-more-open-project"))

		expect(navigateMock).toHaveBeenCalledWith({
			name: RouteName.SuperWorkspaceProjectState,
			params: { projectId: "proj-alpha-001" },
		})
	})

	it("opens the shared project share sheet from the list more-actions share entry", async () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = false
		mockStore.list = [listItem]
		listHookState.moreTarget = listItem
		getAttachmentsByProjectIdMock.mockResolvedValue({
			tree: [{ file_id: "audio-file-001", file_name: "recording-mock.mp3" }],
			list: [],
		})
		processAttachmentDataMock.mockReturnValue({
			tree: [{ file_id: "audio-file-001", file_name: "recording-mock.mp3" }],
			list: [{ file_id: "audio-file-001", file_name: "recording-mock.mp3" }],
		})

		render(<AudioRecordingListPanel />)

		fireEvent.click(screen.getByTestId("mobile-recording-more-share"))

		await waitFor(() => {
			expect(getAttachmentsByProjectIdMock).toHaveBeenCalledWith({
				projectId: "proj-alpha-001",
				temporaryToken: "",
			})
		})
		expect(processAttachmentDataMock).toHaveBeenCalledWith({
			tree: [{ file_id: "audio-file-001", file_name: "recording-mock.mp3" }],
			list: [],
		})
		expect(await screen.findByTestId("project-share-sheet-proj-alpha-001")).toBeInTheDocument()
	})

	it("shows active recording floating indicator when active card leaves viewport", async () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = true
		mockStore.list = []
		const onResumeRecording = vi.fn()

		render(
			<AudioRecordingListPanel
				isSessionActive
				sessionTitle="Current recording"
				sessionDuration="00:05:12"
				WaveformComponent={() => <div data-testid="mock-waveform" />}
				onResumeRecording={onResumeRecording}
			/>,
		)

		expect(screen.queryByTestId("mobile-active-recording-indicator")).not.toBeInTheDocument()
		expect(intersectionObserverCallback).toBeTypeOf("function")

		act(() => {
			intersectionObserverCallback?.(
				[{ isIntersecting: false } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("mobile-active-recording-indicator")).toBeInTheDocument()
		})

		fireEvent.click(screen.getByTestId("mobile-active-recording-indicator-button"))
		expect(onResumeRecording).toHaveBeenCalledTimes(1)
	})

	it("hides floating indicator while active recording card is visible", async () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = true
		mockStore.list = []

		render(
			<AudioRecordingListPanel
				isSessionActive
				sessionTitle="Current recording"
				sessionDuration="00:01:23"
				WaveformComponent={() => <div data-testid="mock-waveform" />}
			/>,
		)

		expect(intersectionObserverCallback).toBeTypeOf("function")

		act(() => {
			intersectionObserverCallback?.(
				[{ isIntersecting: false } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})

		await waitFor(() => {
			expect(screen.getByTestId("mobile-active-recording-indicator")).toBeInTheDocument()
		})

		act(() => {
			intersectionObserverCallback?.(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			)
		})

		await waitFor(() => {
			expect(
				screen.queryByTestId("mobile-active-recording-indicator"),
			).not.toBeInTheDocument()
		})

		expect(setExternallyHiddenMock).toHaveBeenCalledWith(true)
		expect(setExternallyHiddenMock).toHaveBeenCalledWith(false)
	})

	it("collapses the legacy float panel when navigating away during an active session", () => {
		mockStore.showInitialSkeleton = false
		mockStore.isEmpty = true
		mockStore.list = []

		const { unmount } = render(
			<AudioRecordingListPanel
				isSessionActive
				sessionTitle="Current recording"
				sessionDuration="00:05:00"
				WaveformComponent={() => <div data-testid="mock-waveform" />}
			/>,
		)

		unmount()

		expect(setExpandedMock).toHaveBeenCalledWith(false)
	})
})
