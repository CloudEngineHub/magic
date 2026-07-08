import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === "listCount") return `Recordings · ${options?.count}`
			const labels: Record<string, string> = {
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
				"actions.startRecording": "Start Recording",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("../../utils/audio-recordings-utils", () => ({
	toEndOfDayTimestamp: (date: Date) => Math.floor(date.getTime() / 1000),
	toStartOfDayTimestamp: (date: Date) => Math.floor(date.getTime() / 1000),
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

import AudioRecordingsFilters from "../AudioRecordingsFilters"
import { ALL_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"

/** Default props for filter bar rendering and interaction tests */
function renderFilters(overrides: Partial<Parameters<typeof AudioRecordingsFilters>[0]> = {}) {
	const onSummaryFilterChange = vi.fn()
	const onDatePresetChange = vi.fn()
	const onSortByChange = vi.fn()
	const onSortOrderChange = vi.fn()
	const onSearchKeywordChange = vi.fn()
	const onSearchCompositionStart = vi.fn()
	const onSearchCompositionEnd = vi.fn()
	const onRefresh = vi.fn()
	const onGroupChange = vi.fn()
	const onManageGroups = vi.fn()

	render(
		<AudioRecordingsFilters
			listCount={3}
			summaryFilter="all"
			datePreset="all"
			sortBy="updated_at"
			sortOrder="desc"
			searchKeyword=""
			isRefreshing={false}
			groups={[]}
			totalGroupCount={3}
			ungroupedCount={3}
			currentGroupId={ALL_RECORDING_GROUP_ID}
			onGroupChange={onGroupChange}
			onManageGroups={onManageGroups}
			onSummaryFilterChange={onSummaryFilterChange}
			onDatePresetChange={onDatePresetChange}
			onSortByChange={onSortByChange}
			onSortOrderChange={onSortOrderChange}
			onSearchKeywordChange={onSearchKeywordChange}
			onSearchCompositionStart={onSearchCompositionStart}
			onSearchCompositionEnd={onSearchCompositionEnd}
			onRefresh={onRefresh}
			{...overrides}
		/>,
	)

	return {
		onSummaryFilterChange,
		onDatePresetChange,
		onSortByChange,
		onSortOrderChange,
		onSearchKeywordChange,
		onRefresh,
		onGroupChange,
		onManageGroups,
	}
}

describe("AudioRecordingsFilters", () => {
	it("renders summary, date, sort, search, and refresh controls in one bar", () => {
		renderFilters()

		expect(screen.getByTestId("audio-recordings-filters")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-summary-filter")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-date-filter")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-sort-filter")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-search-input")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-refresh-button")).toBeInTheDocument()
		expect(screen.getByTestId("audio-recordings-group-filter-trigger")).toHaveTextContent("3")
	})

	it("shows the active summary option label on the trigger", () => {
		renderFilters({ summaryFilter: "summarized", listCount: 7 })

		expect(screen.getByTestId("audio-recordings-summary-filter")).toHaveTextContent(
			"Summarized",
		)
	})

	it("calls onSummaryFilterChange when a summary menu item is selected", () => {
		const { onSummaryFilterChange } = renderFilters()

		fireEvent.click(screen.getByTestId("audio-recordings-summary-filter"))
		fireEvent.click(screen.getByTestId("audio-recordings-summary-not_summarized"))

		expect(onSummaryFilterChange).toHaveBeenCalledWith("not_summarized")
	})

	it("calls onDatePresetChange when a date menu item is selected", () => {
		const { onDatePresetChange } = renderFilters()

		fireEvent.click(screen.getByTestId("audio-recordings-date-filter"))
		fireEvent.click(screen.getByTestId("audio-recordings-date-week"))

		expect(onDatePresetChange).toHaveBeenCalledWith("week")
	})

	it("renders group switcher and supports changing group and opening group management", () => {
		const groups = [
			{ id: "group-1", name: "Work", projectCount: 2, isVirtual: false },
			{ id: "group-2", name: "Life", projectCount: 1, isVirtual: false },
		]
		const { onGroupChange, onManageGroups } = renderFilters({
			groups,
			totalGroupCount: 3,
			ungroupedCount: 1,
			currentGroupId: "group-1",
		})

		// 1. Should display current active group name
		expect(screen.getByTestId("audio-recordings-group-filter-trigger")).toHaveTextContent(
			"Work",
		)

		// 2. Click trigger and click custom group items
		fireEvent.click(screen.getByTestId("audio-recordings-group-filter-trigger"))
		fireEvent.click(screen.getByTestId("audio-recordings-group-custom-group-2"))
		expect(onGroupChange).toHaveBeenCalledWith("group-2")

		// 3. Click virtual "All" item
		fireEvent.click(screen.getByTestId("audio-recordings-group-all"))
		expect(onGroupChange).toHaveBeenCalledWith(ALL_RECORDING_GROUP_ID)

		// 4. Click manage groups button
		fireEvent.click(screen.getByTestId("audio-recordings-group-manage-trigger"))
		expect(onManageGroups).toHaveBeenCalled()
	})
})
