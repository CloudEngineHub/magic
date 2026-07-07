import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { LiveAudioWaveform } from "./LiveAudioWaveform"

interface MobileActiveRecordingIndicatorProps {
	hidden?: boolean
	duration: string
	isPaused: boolean
	onOpen: () => void
}

const BALL_SIZE = 48
const DEFAULT_RIGHT = 16
const DEFAULT_BOTTOM = 104
const STORAGE_KEY = "rec-ball-position"
/**
 * Reads stored absolute coordinates from localStorage if available.
 */
function readStoredPosition(): { x: number; y: number } | null {
	if (typeof window === "undefined") return null
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as { x: number; y: number }
		if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed
	} catch {
		// Ignore parsing or storage access errors in non-browser/restricted H5 contexts
	}
	return null
}

/**
 * Formats a duration string (e.g., "00:00:19" or "01:24:59" or "15:30") to exactly 4 digits.
 * - Under an hour (e.g., "00:00:19" or "15:30"): shows "MM:SS" (e.g., "00:19", "15:30").
 * - Hour or more (e.g., "01:24:59"): shows "HH:MM" (e.g., "01:24"), dropping seconds.
 */
function formatDurationToFourDigits(rawDuration: string): string {
	const parts = rawDuration.split(":")

	// If it has 3 parts (HH:MM:SS)
	if (parts.length === 3) {
		const hh = parts[0]
		const mm = parts[1]
		const ss = parts[2]

		if (hh === "00" || hh === "0") {
			// Under an hour: show MM:SS
			return `${mm}:${ss}`
		} else {
			// One hour or more: show HH:MM (drop seconds)
			return `${hh}:${mm}`
		}
	}

	// If it has 2 parts (MM:SS or HH:MM), return as-is (already 4 digits)
	return rawDuration
}
/**
 * Global floating active recording indicator shown when the list card scrolls out of view.
 * Features canvas waveform, Pointer Events drag-to-move, localStorage persistence, and custom high-fidelity shadows.
 */
export function MobileActiveRecordingIndicator({
	hidden = false,
	duration,
	isPaused,
	onOpen,
}: MobileActiveRecordingIndicatorProps) {
	const { t } = useTranslation("super")
	const [position, setPosition] = useState<{ x: number; y: number } | null>(() =>
		readStoredPosition(),
	)
	const [isDragging, setIsDragging] = useState(false)
	const wrapperRef = useRef<HTMLDivElement>(null)
	const dragStartRef = useRef<{
		pointerX: number
		pointerY: number
		ballX: number
		ballY: number
	} | null>(null)
	const hasDraggedRef = useRef(false)

	const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault()
		hasDraggedRef.current = false
		const el = wrapperRef.current
		if (!el) return
		const rect = el.getBoundingClientRect()
		dragStartRef.current = {
			pointerX: e.clientX,
			pointerY: e.clientY,
			ballX: rect.left,
			ballY: rect.top,
		}
		el.setPointerCapture(e.pointerId)
		setIsDragging(true)
	}, [])

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!isDragging || !dragStartRef.current) return
			const dx = e.clientX - dragStartRef.current.pointerX
			const dy = e.clientY - dragStartRef.current.pointerY
			if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
				hasDraggedRef.current = true
			}
			const newX = dragStartRef.current.ballX + dx
			const newY = dragStartRef.current.ballY + dy
			const maxX = window.innerWidth - BALL_SIZE
			const maxY = window.innerHeight - BALL_SIZE
			setPosition({
				x: Math.max(0, Math.min(newX, maxX)),
				y: Math.max(0, Math.min(newY, maxY)),
			})
		},
		[isDragging],
	)

	const handlePointerUp = useCallback(() => {
		setIsDragging(false)
		dragStartRef.current = null
	}, [])

	const handleClick = useCallback(() => {
		// Prevent opening detail page if we just finished dragging the ball
		if (hasDraggedRef.current) {
			hasDraggedRef.current = false
			return
		}
		onOpen()
	}, [onOpen])

	// Sync ball position coordinates to localStorage upon drop
	useEffect(() => {
		if (isDragging || !position) return
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
		} catch {
			// Fail-safe storage access
		}
	}, [isDragging, position])

	if (hidden) return null

	const positionStyle: React.CSSProperties = position
		? { left: position.x, top: position.y }
		: { right: DEFAULT_RIGHT, bottom: DEFAULT_BOTTOM }

	return (
		<div
			ref={wrapperRef}
			role="button"
			tabIndex={0}
			aria-label={t("super:mobile.recordingEntry.active.backAria")}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onOpen()
			}}
			style={{
				position: "fixed",
				width: BALL_SIZE,
				height: BALL_SIZE,
				zIndex: 50,
				cursor: isDragging ? "grabbing" : "grab",
				userSelect: "none",
				touchAction: "none",
				...positionStyle,
			}}
			data-testid="mobile-active-recording-indicator"
		>
			{/* Rounded ball body container with custom gradient background and light/dark theme shadows */}
			<div
				aria-hidden
				data-testid="mobile-active-recording-indicator-button"
				style={{
					position: "absolute",
					inset: 0,
					borderRadius: "50%",
					background:
						"linear-gradient(128deg, rgba(82,82,91,0.9) 16.49%, rgba(10,10,10,0.96) 87.64%)",
					boxShadow: isPaused
						? "0 4px 24px rgba(0,0,0,0.35)"
						: "0 4px 28px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
					opacity: isPaused ? 0.65 : 1,
					transition: "opacity 0.25s, box-shadow 0.25s",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 1,
				}}
			>
				{/* Mini scrolling waveform inside the ball */}
				<LiveAudioWaveform
					active={!isPaused}
					color="rgba(255,255,255,0.88)"
					height={20}
					barWidth={2}
					barGap={2}
					sampleIntervalMs={250}
					fadeWidth={0}
					className="w-[24px]"
				/>

				{/* Floating numeric elapsed time text */}
				<span
					style={{
						fontSize: 8,
						fontWeight: 600,
						fontVariantNumeric: "tabular-nums",
						color: isPaused ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.9)",
						letterSpacing: "0.04em",
						lineHeight: 1,
						transition: "color 0.25s",
					}}
				>
					{formatDurationToFourDigits(duration)}
				</span>
			</div>
		</div>
	)
}

