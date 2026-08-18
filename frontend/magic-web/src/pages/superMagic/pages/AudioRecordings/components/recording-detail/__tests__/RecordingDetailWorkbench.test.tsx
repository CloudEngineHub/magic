import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RecordingDetailWorkbench } from "../RecordingDetailWorkbench"
import {
	RECORDING_DETAIL_SUMMARY_MIN_WIDTH,
	RECORDING_DETAIL_TRANSCRIPT_MAX_WIDTH,
	RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH,
	RECORDING_DETAIL_WORKBENCH_MIN_WIDTH,
} from "../recording-detail-layout"

describe("RecordingDetailWorkbench", () => {
	/** Verifies the reusable owner/share workbench remains a pure two-column detail surface. */
	it("renders only the recording and generated-detail columns", () => {
		render(
			<RecordingDetailWorkbench
				left={<div data-testid="workbench-left">Left</div>}
				right={<div data-testid="workbench-right">Right</div>}
			/>,
		)

		const workbench = screen.getByTestId("recording-detail-workbench")
		const scrollContainer = screen.getByTestId("recording-detail-workbench-scroll")
		expect(workbench.children).toHaveLength(2)
		expect(scrollContainer).toHaveClass("overflow-x-auto", "overflow-y-hidden")
		expect(workbench).toHaveStyle({
			minWidth: `${RECORDING_DETAIL_WORKBENCH_MIN_WIDTH}px`,
			gridTemplateColumns: `minmax(${RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH}px, ${RECORDING_DETAIL_TRANSCRIPT_MAX_WIDTH}px) minmax(${RECORDING_DETAIL_SUMMARY_MIN_WIDTH}px, 1fr)`,
		})
		expect(screen.getByTestId("workbench-left")).toBeInTheDocument()
		expect(screen.getByTestId("workbench-right")).toBeInTheDocument()
	})
})
