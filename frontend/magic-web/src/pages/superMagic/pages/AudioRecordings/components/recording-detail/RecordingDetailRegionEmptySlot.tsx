import type { ReactNode } from "react"

interface RecordingDetailRegionEmptySlotProps {
	children: ReactNode
}

/** Fills the scroll/flex region and centers empty placeholder content vertically and horizontally. */
export function RecordingDetailRegionEmptySlot({ children }: RecordingDetailRegionEmptySlotProps) {
	return (
		<div
			className="flex h-full min-h-full w-full flex-1 items-center justify-center"
			data-testid="recording-detail-region-empty-slot"
		>
			{children}
		</div>
	)
}
