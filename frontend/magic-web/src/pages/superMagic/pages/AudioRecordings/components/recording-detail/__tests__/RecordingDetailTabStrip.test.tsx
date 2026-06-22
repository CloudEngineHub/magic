import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RecordingDetailTabStrip } from "../RecordingDetailTabStrip"

describe("RecordingDetailTabStrip", () => {
	it("renders tab labels without the legacy muted segmented track", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="summary"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-strip")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-tab-strip")).not.toHaveClass("bg-muted")
		expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument()
	})

	it("shows badge only when badgeCount is greater than zero", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "marks", label: "Marks", badgeCount: 3 },
					{ key: "empty", label: "Empty", badgeCount: 0 },
				]}
				activeKey="summary"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-badge-marks")).toHaveTextContent("3")
		expect(screen.queryByTestId("recording-detail-tab-badge-empty")).not.toBeInTheDocument()
	})

	it("calls onChange when a tab is clicked", () => {
		const onChange = vi.fn()

		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="summary"
				onChange={onChange}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Notes" }))
		expect(onChange).toHaveBeenCalledWith("notes")
	})

	it("applies active text color on the selected tab", () => {
		render(
			<RecordingDetailTabStrip
				tabs={[
					{ key: "summary", label: "Summary" },
					{ key: "notes", label: "Notes" },
				]}
				activeKey="notes"
				onChange={() => undefined}
			/>,
		)

		expect(screen.getByTestId("recording-detail-tab-notes")).toHaveClass("text-background")
		expect(screen.getByTestId("recording-detail-tab-summary")).toHaveClass("text-muted-foreground")
	})
})
