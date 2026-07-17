import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingFilterSheet } from "../MobileRecordingFilterSheet"
import { MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT } from "../../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"super:mobile.recordingEntry.filterSheet.dateRange.all": "All dates",
				"super:mobile.recordingEntry.filterSheet.dateRange.today": "Today",
				"super:mobile.recordingEntry.filterSheet.dateRange.week": "This week",
				"super:mobile.recordingEntry.filterSheet.dateRange.month": "This month",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		headerLeadingAction,
		headerTrailingAction,
	}: {
		children: React.ReactNode
		visible: boolean
		headerLeadingAction?: { onClick: () => void; testId?: string }
		headerTrailingAction?: { onClick: () => void; testId?: string }
	}) =>
		visible ? (
			<div data-testid="mock-magic-popup">
				{headerLeadingAction ? (
					<button
						type="button"
						data-testid={headerLeadingAction.testId}
						onClick={headerLeadingAction.onClick}
					>
						leading
					</button>
				) : null}
				{headerTrailingAction ? (
					<button
						type="button"
						data-testid={headerTrailingAction.testId}
						onClick={headerTrailingAction.onClick}
					>
						reset
					</button>
				) : null}
				{children}
			</div>
		) : null,
}))

describe("MobileRecordingFilterSheet", () => {
	it("applies date and sort selections via onChange", () => {
		const onChange = vi.fn()
		const onSummaryFilterChange = vi.fn()
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT}
				summaryFilter="all"
				onChange={onChange}
				onSummaryFilterChange={onSummaryFilterChange}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-filter-date-week"))
		expect(onChange).toHaveBeenCalledWith({
			...MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
			datePreset: "week",
		})

		fireEvent.click(screen.getByTestId("mobile-recording-filter-sort-created_at_desc"))
		expect(onChange).toHaveBeenCalledWith({
			...MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
			sortOption: "created_at_desc",
		})
	})

	it("applies summary status selection via onSummaryFilterChange", () => {
		const onSummaryFilterChange = vi.fn()
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT}
				summaryFilter="all"
				onChange={vi.fn()}
				onSummaryFilterChange={onSummaryFilterChange}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-filter-summary-summarized"))
		expect(onSummaryFilterChange).toHaveBeenCalledWith("summarized")
	})

	it("renders static translated labels for each date preset", () => {
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT}
				summaryFilter="all"
				onChange={vi.fn()}
				onSummaryFilterChange={vi.fn()}
			/>,
		)

		expect(screen.getByText("All dates")).toBeInTheDocument()
		expect(screen.getByText("Today")).toBeInTheDocument()
		expect(screen.getByText("This week")).toBeInTheDocument()
		expect(screen.getByText("This month")).toBeInTheDocument()
	})

	it("resets filters to default when reset is clicked", () => {
		const onChange = vi.fn()
		const onSummaryFilterChange = vi.fn()
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={{ datePreset: "month", sortOption: "created_at_desc" }}
				summaryFilter="summarized"
				onChange={onChange}
				onSummaryFilterChange={onSummaryFilterChange}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-filter-sheet-reset"))
		expect(onChange).toHaveBeenCalledWith(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)
		expect(onSummaryFilterChange).toHaveBeenCalledWith("all")
	})
})
