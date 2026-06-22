import type { ReactNode } from "react"

interface RecordingDetailWorkbenchProps {
	left: ReactNode
	right: ReactNode
}

/** Pure dual-column layout shell without routing or API dependencies. */
export function RecordingDetailWorkbench({ left, right }: RecordingDetailWorkbenchProps) {
	return (
		<div
			className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] gap-6 px-8 pb-8"
			data-testid="recording-detail-workbench"
		>
			<div className="flex min-h-0 flex-col gap-4">{left}</div>
			<div className="min-h-0">{right}</div>
		</div>
	)
}
