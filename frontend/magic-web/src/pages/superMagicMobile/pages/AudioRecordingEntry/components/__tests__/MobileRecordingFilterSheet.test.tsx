import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingFilterSheet } from "../MobileRecordingFilterSheet"
import { MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT } from "../../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		headerTrailingAction,
	}: {
		children: React.ReactNode
		visible: boolean
		headerTrailingAction?: { onClick: () => void; testId?: string }
	}) =>
		visible ? (
			<div data-testid="mock-magic-popup">
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
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT}
				onChange={onChange}
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

	it("resets filters to default when reset is clicked", () => {
		const onChange = vi.fn()
		render(
			<MobileRecordingFilterSheet
				open
				onOpenChange={vi.fn()}
				filter={{ datePreset: "month", sortOption: "created_at_desc" }}
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-recording-filter-sheet-reset"))
		expect(onChange).toHaveBeenCalledWith(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)
	})
})
