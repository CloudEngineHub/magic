import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"

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

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils", () => ({
	isAudioProjectPreviewReady: () => true,
	resolveRecordingDisplayName: (name: string) => name,
}))

vi.mock("antd-mobile", () => ({
	InfiniteScroll: () => <div data-testid="mobile-recording-infinite-scroll" />,
}))

vi.mock("@/components/base-mobile/MagicPullToRefresh", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
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
		<div data-testid={`mobile-recording-card-${item.id}`}>{item.project_name}</div>
	),
}))

vi.mock("../components/MobileRecordingMoreSheet", () => ({
	MobileRecordingMoreSheet: () => null,
}))

vi.mock("../components/MobileRecordingFilterSheet", () => ({
	MobileRecordingFilterSheet: () => null,
}))

vi.mock("../components/MobileRecordingSummarySheet", () => ({
	MobileRecordingSummarySheet: () => null,
}))

vi.mock("../components/MobileRecordingImportSheet", () => ({
	MobileRecordingImportSheet: () => null,
}))

vi.mock("../components/MobileRecordingFab", () => ({
	MobileRecordingFab: () => <div data-testid="mobile-recording-fab" />,
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
		summarySheetOpen: false,
		setSummarySheetOpen: vi.fn(),
		importSheetOpen: false,
		setImportSheetOpen: vi.fn(),
		activeFilterCount: 0,
		debouncedKeyword: "",
		moreTarget: null,
		handleRefresh: vi.fn(),
		handleLoadMore: vi.fn(),
		handleSummaryFilterChange: vi.fn(),
		handleFilterStateChange: vi.fn(),
		handleOpenSearch: vi.fn(),
		handleDismissSearch: vi.fn(),
		handleOpenMore: vi.fn(),
		handleCloseMore: vi.fn(),
	}),
}))

import AudioRecordingListPanel from "../AudioRecordingListPanel"

describe("AudioRecordingListPanel", () => {
	it("renders toolbar and recording empty state when list is empty", () => {
		mockStore.list = []
		mockStore.isEmpty = true
		mockStore.showInitialSkeleton = false

		render(<AudioRecordingListPanel />)

		expect(screen.getByTestId("mobile-audio-recording-list-panel")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-toolbar")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-data-empty-state-recording")).toBeInTheDocument()
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
		mockStore.list = [
			{
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
			},
		]

		render(<AudioRecordingListPanel />)

		expect(screen.getByTestId("mobile-recording-card-list")).toBeInTheDocument()
		expect(screen.getByTestId("mobile-recording-card-proj-alpha-001")).toBeInTheDocument()
	})
})
