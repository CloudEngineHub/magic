import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RecordingSpeakerFilterControl } from "../RecordingSpeakerFilterControl"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.speakerFilterReset": "Reset speakers",
			}
			return labels[key] ?? key
		},
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		visible,
		children,
		headerLeadingAction,
		headerTrailingAction,
		"data-testid": dataTestId,
	}: {
		visible?: boolean
		children?: React.ReactNode
		headerLeadingAction?: { ariaLabel: string; onClick: () => void }
		headerTrailingAction?: { ariaLabel: string; onClick: () => void }
		"data-testid"?: string
	}) =>
		visible ? (
			<div data-testid={dataTestId ?? "mock-speaker-filter-sheet"}>
				{headerLeadingAction ? (
					<button type="button" onClick={headerLeadingAction.onClick}>
						{headerLeadingAction.ariaLabel}
					</button>
				) : null}
				{headerTrailingAction ? (
					<button type="button" onClick={headerTrailingAction.onClick}>
						{headerTrailingAction.ariaLabel}
					</button>
				) : null}
				{children}
			</div>
		) : null,
}))

/** Exercises the shared cross-platform speaker-filter trigger and selection affordances. */
describe("RecordingSpeakerFilterControl", () => {
	it("shows the active speaker count badge on the desktop trigger", async () => {
		render(
			<RecordingSpeakerFilterControl
				speakerIds={["Speaker-1", "Speaker-2"]}
				selectedIds={["Speaker-1"]}
				onChange={vi.fn()}
				labels={{ "Speaker-1": "Host", "Speaker-2": "Guest" }}
				presentation="menu"
				title="Filter speakers"
			/>,
		)

		expect(screen.getByTestId("recording-detail-open-speaker-filter")).toHaveTextContent("1")
	})

	it("opens the mobile sheet presentation and resets back to all speakers", () => {
		const onChange = vi.fn()

		render(
			<RecordingSpeakerFilterControl
				speakerIds={["Speaker-1", "Speaker-2"]}
				selectedIds={["Speaker-1"]}
				onChange={onChange}
				labels={{ "Speaker-1": "Host", "Speaker-2": "Guest" }}
				presentation="sheet"
				title="Filter speakers"
			/>,
		)

		fireEvent.click(screen.getByTestId("recording-detail-open-speaker-filter"))
		expect(screen.getByTestId("recording-detail-speaker-filter-sheet")).toBeInTheDocument()
		expect(screen.queryByText("All speakers")).toBeNull()

		fireEvent.click(screen.getByText("Reset speakers"))
		expect(onChange).toHaveBeenCalledWith(["Speaker-1", "Speaker-2"])
	})
})
