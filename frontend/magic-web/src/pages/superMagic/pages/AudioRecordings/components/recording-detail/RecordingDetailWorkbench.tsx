import type { ReactNode } from "react"
import { cn } from "@/utils/cn"
import {
	RECORDING_DETAIL_SUMMARY_MIN_WIDTH,
	RECORDING_DETAIL_TRANSCRIPT_MAX_WIDTH,
	RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH,
	RECORDING_DETAIL_WORKBENCH_MIN_WIDTH,
} from "./recording-detail-layout"

interface RecordingDetailWorkbenchProps {
	left: ReactNode
	right: ReactNode
	/** Uses the tighter gutter required when the workbench is embedded in a project file preview. */
	compactHorizontalPadding?: boolean
}

/** Renders the recording content and generated detail as the inner two-column workbench. */
export function RecordingDetailWorkbench({
	left,
	right,
	compactHorizontalPadding = false,
}: RecordingDetailWorkbenchProps) {
	return (
		<div
			className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:thin]"
			data-testid="recording-detail-workbench-scroll"
		>
			<div
				className={cn(
					"grid h-full min-h-0 w-full gap-6 pb-8 duration-300 animate-in fade-in",
					compactHorizontalPadding ? "px-2.5" : "px-8",
				)}
				style={{
					minWidth: RECORDING_DETAIL_WORKBENCH_MIN_WIDTH,
					gridTemplateColumns: `minmax(${RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH}px, ${RECORDING_DETAIL_TRANSCRIPT_MAX_WIDTH}px) minmax(${RECORDING_DETAIL_SUMMARY_MIN_WIDTH}px, 1fr)`,
				}}
				data-testid="recording-detail-workbench"
			>
				{/* Preserve readable column widths and let the workbench scroll instead of compressing content. */}
				<div className="flex min-h-0 flex-col gap-4">{left}</div>
				<div className="min-h-0 min-w-0">{right}</div>
			</div>
		</div>
	)
}
