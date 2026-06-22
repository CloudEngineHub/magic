import type { ReactNode } from "react"

interface RecordingDetailRegionEmptySlotProps {
	children: ReactNode
}

/** Fills the scroll/flex region and centers empty placeholder content vertically and horizontally. */
export function RecordingDetailRegionEmptySlot({ children }: RecordingDetailRegionEmptySlotProps) {
	return (
		<div
			className="flex min-h-full w-full items-center justify-center"
			data-testid="recording-detail-region-empty-slot"
		>
			{children}
		</div>
	)
}
