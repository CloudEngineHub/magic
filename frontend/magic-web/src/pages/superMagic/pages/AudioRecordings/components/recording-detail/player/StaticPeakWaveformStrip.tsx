import { useMemo, type CSSProperties } from "react"
import type { FlatColorSegment } from "../../../utils/chapter-color-segments"

/** Muted blend for played bars while playback is paused — matches prototype pause styling. */
const PAUSED_PLAYED_BAR_BG: CSSProperties = {
	background: "color-mix(in oklch, rgb(var(--muted-foreground-rgb)) 70%, transparent)",
}

interface StaticPeakWaveformStripProps {
	peakNorms: number[]
	maxBarPx: number
	currentSec: number
	durationSec: number
	className?: string
	paused?: boolean
	colorSegments?: FlatColorSegment[]
}

/**
 * Renders simulated peak bars with prototype clip-path progress layering.
 * Unplayed bars stay gray; played portion uses foreground (or muted mix when paused).
 */
export function StaticPeakWaveformStrip({
	peakNorms,
	maxBarPx,
	currentSec,
	durationSec,
	className,
	paused = false,
	colorSegments,
}: StaticPeakWaveformStripProps) {
	const safeDur = durationSec > 0 && Number.isFinite(durationSec) ? durationSec : 0
	const progress = safeDur > 0 ? Math.min(1, Math.max(0, currentSec / safeDur)) : 0
	const clipRightPct = (1 - progress) * 100

	const barHeightsPx = useMemo(
		() =>
			peakNorms.map((norm) =>
				Math.max(2, Math.min(maxBarPx, 2 + norm * Math.max(2, maxBarPx - 2))),
			),
		[peakNorms, maxBarPx],
	)

	function barRow(barClass: string | undefined, barStyle?: CSSProperties) {
		return (
			<div className="absolute inset-0 flex items-center justify-stretch gap-0">
				{barHeightsPx.map((height, index) => (
					<div key={index} className="flex min-w-0 flex-1 items-center justify-center">
						<span
							className={barClass ? `shrink-0 ${barClass}` : "shrink-0"}
							style={{ width: 1, height, ...barStyle }}
						/>
					</div>
				))}
			</div>
		)
	}

	const hasColorLine = colorSegments && colorSegments.length > 0 && safeDur > 0

	return (
		<div
			className={className}
			style={{ position: "relative", height: maxBarPx, width: "100%", overflow: "hidden" }}
		>
			{barRow("bg-muted-foreground/45")}
			<div
				className="pointer-events-none absolute inset-0 overflow-hidden"
				style={{ clipPath: `inset(0 ${clipRightPct}% 0 0)` }}
			>
				{paused ? barRow(undefined, PAUSED_PLAYED_BAR_BG) : barRow("bg-foreground")}
			</div>
			{hasColorLine ? (
				<div
					className="pointer-events-none absolute left-0 right-0"
					style={{ top: "50%", transform: "translateY(-50%)", height: 2 }}
				>
					{/* Subtle gray base line — colored topic segments overlay in their time ranges. */}
					<div
						className="absolute inset-0"
						style={{
							background:
								"color-mix(in oklch, rgb(var(--muted-foreground-rgb)) 25%, transparent)",
						}}
					/>
					{colorSegments.map((segment, index) => {
						const left = (segment.start / safeDur) * 100
						const width = ((segment.end - segment.start) / safeDur) * 100
						if (width <= 0) return null
						return (
							<div
								key={index}
								className="absolute top-0 h-full"
								style={{
									left: `${left}%`,
									width: `${width}%`,
									background: segment.color,
								}}
							/>
						)
					})}
				</div>
			) : null}
		</div>
	)
}
