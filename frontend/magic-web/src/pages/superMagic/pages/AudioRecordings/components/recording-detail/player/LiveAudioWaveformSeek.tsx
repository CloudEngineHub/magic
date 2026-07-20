import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react"
import type { FlatColorSegment } from "../../../utils/chapter-color-segments"
import { StaticPeakWaveformStrip } from "./StaticPeakWaveformStrip"

/** Formats seconds as HH:MM:SS for waveform slider aria text. */
function formatHMS(sec: number): string {
	const t = Math.max(0, sec)
	const h = Math.floor(t / 3600)
	const m = Math.floor((t % 3600) / 60)
	const s = Math.floor(t % 60)
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

interface LiveAudioWaveformSeekProps {
	durationSec: number
	currentSec: number
	peakNorms: number[]
	maxBarPx: number
	paused: boolean
	onSeek: (sec: number) => void
	ariaLabel: string
	seekKeyboardStep: number
	colorSegments?: FlatColorSegment[]
}

/**
 * Interactive waveform seek control with drag, keyboard navigation, and slider semantics.
 */
export function LiveAudioWaveformSeek({
	durationSec,
	currentSec,
	peakNorms,
	maxBarPx,
	paused,
	onSeek,
	ariaLabel,
	seekKeyboardStep,
	colorSegments,
}: LiveAudioWaveformSeekProps) {
	const wrapRef = useRef<HTMLDivElement>(null)
	const draggingRef = useRef(false)
	const duration = Math.max(0.001, durationSec)

	const ratioFromClientX = useCallback((clientX: number) => {
		const el = wrapRef.current
		if (!el) return 0
		const rect = el.getBoundingClientRect()
		return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
	}, [])

	const commitSeek = useCallback(
		(clientX: number) => {
			onSeek(ratioFromClientX(clientX) * duration)
		},
		[duration, onSeek, ratioFromClientX],
	)

	function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.button !== 0) return
		event.preventDefault()
		draggingRef.current = true
		event.currentTarget.setPointerCapture(event.pointerId)
		commitSeek(event.clientX)
	}

	function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return
		event.preventDefault()
		commitSeek(event.clientX)
	}

	function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return
		draggingRef.current = false
		try {
			event.currentTarget.releasePointerCapture(event.pointerId)
		} catch {
			// pointer may already be released
		}
	}

	return (
		<div
			ref={wrapRef}
			className="relative w-full"
			style={{ height: maxBarPx, touchAction: "none" }}
		>
			<StaticPeakWaveformStrip
				peakNorms={peakNorms}
				maxBarPx={maxBarPx}
				currentSec={currentSec}
				durationSec={durationSec}
				paused={paused}
				colorSegments={colorSegments}
				className="pointer-events-none"
			/>
			<div
				role="slider"
				aria-label={ariaLabel}
				aria-valuemin={0}
				aria-valuemax={Math.round(durationSec)}
				aria-valuenow={Math.round(currentSec)}
				aria-valuetext={`${formatHMS(currentSec)} / ${formatHMS(durationSec)}`}
				tabIndex={0}
				className="absolute inset-0 z-[1] touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card"
				onKeyDown={(event) => {
					const step = seekKeyboardStep
					if (event.key === "ArrowRight" || event.key === "ArrowUp") {
						event.preventDefault()
						onSeek(Math.min(duration, currentSec + step))
					}
					if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
						event.preventDefault()
						onSeek(Math.max(0, currentSec - step))
					}
					if (event.key === "Home") {
						event.preventDefault()
						onSeek(0)
					}
					if (event.key === "End") {
						event.preventDefault()
						onSeek(duration)
					}
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onLostPointerCapture={() => {
					draggingRef.current = false
				}}
			/>
		</div>
	)
}
