import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecordingDetailRegionEmptySlot } from "../RecordingDetailRegionEmptySlot"

describe("RecordingDetailRegionEmptySlot", () => {
	it("renders flex centering classes so empty content fills and centers in the region", () => {
		render(
			<RecordingDetailRegionEmptySlot>
				<span>Empty placeholder</span>
			</RecordingDetailRegionEmptySlot>,
		)

		const slot = screen.getByTestId("recording-detail-region-empty-slot")
		expect(slot).toHaveClass("min-h-full", "items-center", "justify-center")
		expect(screen.getByText("Empty placeholder")).toBeInTheDocument()
	})
})
