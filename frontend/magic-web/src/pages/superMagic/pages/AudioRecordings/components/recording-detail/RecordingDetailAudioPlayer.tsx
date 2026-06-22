import type { PointerEvent, ReactNode, RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Maximize2, Minimize2, Pause, Play } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { formatRecordingTime } from "../../utils/time"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"

interface RecordingDetailAudioPlayerProps {
	audioRef: RefObject<HTMLAudioElement>
	audioUrl: string
	currentTime: number
	duration: number
	progress: number
	playing: boolean
	expanded: boolean
	playbackRate: number
	onToggle: () => void
	onSeek: (seconds: number) => void
	onExpandedChange: (expanded: boolean) => void
	onPlaybackRateChange: (rate: number) => void
}

const PLAYBACK_RATES = [1.0, 1.25, 1.5, 2.0] as const

/** Formats a duration in seconds into HH:MM:SS for the desktop player chrome. */
function formatHMS(sec: number): string {
	const t = Math.max(0, sec)
	const h = Math.floor(t / 3600)
	const m = Math.floor((t % 3600) / 60)
	const s = Math.floor(t % 60)
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function formatPlaybackRateLabel(rate: number): string {
	if (rate === 1 || rate === 2) return rate.toFixed(1)
	return String(rate)
}

/** Inline desktop audio player bound to the shared detail audio element. */
export function RecordingDetailAudioPlayer({
	audioRef,
	audioUrl,
	currentTime,
	duration,
	progress,
	playing,
	expanded,
	playbackRate,
	onToggle,
	onSeek,
	onExpandedChange,
	onPlaybackRateChange,
}: RecordingDetailAudioPlayerProps) {
	const { t } = useTranslation("audioRecordings")
	const [rateMenuOpen, setRateMenuOpen] = useState(false)
	const rateMenuWrapRef = useRef<HTMLDivElement>(null)
	const bars = useMemo(() => buildStaticWaveformBars(120), [])

	useEffect(() => {
		if (!expanded) setRateMenuOpen(false)
	}, [expanded])

	useEffect(() => {
		if (!rateMenuOpen) return
		const onDocDown = (event: MouseEvent) => {
			const el = rateMenuWrapRef.current
			if (el && !el.contains(event.target as Node)) setRateMenuOpen(false)
		}
		document.addEventListener("mousedown", onDocDown)
		return () => document.removeEventListener("mousedown", onDocDown)
	}, [rateMenuOpen])

	if (!audioUrl) {
		return (
			<div className="rounded-2xl border border-border bg-card p-4">
				<RecordingDetailEmptyState variant="noAudio" compact />
			</div>
		)
	}

	return (
		<div
			className="rounded-2xl border border-border bg-card p-4 shadow-xs"
			data-testid="recording-detail-audio-player"
		>
			<audio ref={audioRef} src={audioUrl} preload="metadata" />
			{expanded ? (
				<div className="flex flex-col gap-3">
					<WaveformSeek
						bars={bars}
						progress={progress}
						duration={duration}
						onSeek={onSeek}
						maxBarHeight={52}
					/>
					<div className="flex items-center justify-between text-[13px] tabular-nums text-muted-foreground">
						<span>{formatHMS(currentTime)}</span>
						<span>{formatHMS(duration)}</span>
					</div>
					<div className="grid grid-cols-5 items-center gap-1">
						<div className="relative flex justify-center" ref={rateMenuWrapRef}>
							<button
								type="button"
								onClick={() => setRateMenuOpen((open) => !open)}
								className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium tabular-nums hover:bg-muted"
							>
								{formatPlaybackRateLabel(playbackRate)}x
								<ChevronDown
									className={cn("size-4", rateMenuOpen && "rotate-180")}
								/>
							</button>
							{rateMenuOpen ? (
								<div className="absolute bottom-full left-0 z-50 mb-1 min-w-36 rounded-xl border border-border bg-popover py-1 shadow-md">
									{PLAYBACK_RATES.map((rate) => (
										<button
											key={rate}
											type="button"
											onClick={() => {
												onPlaybackRateChange(rate)
												setRateMenuOpen(false)
											}}
											className={cn(
												"flex w-full px-3 py-2 text-left text-sm hover:bg-muted",
												rate === playbackRate && "bg-muted font-medium",
											)}
										>
											{formatPlaybackRateLabel(rate)}x
										</button>
									))}
								</div>
							) : null}
						</div>
						<PlayerGhostButton
							label="-15s"
							onClick={() => onSeek(Math.max(0, currentTime - 15))}
						>
							-15s
						</PlayerGhostButton>
						<PlayerToggleButton playing={playing} onToggle={onToggle} />
						<PlayerGhostButton
							label="+15s"
							onClick={() => onSeek(Math.min(duration, currentTime + 15))}
						>
							+15s
						</PlayerGhostButton>
						<PlayerGhostButton label="collapse" onClick={() => onExpandedChange(false)}>
							<Minimize2 className="size-4" />
						</PlayerGhostButton>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
						onClick={onToggle}
						aria-label={playing ? t("detail.pause") : t("detail.play")}
					>
						{playing ? (
							<Pause className="size-4" fill="currentColor" />
						) : (
							<Play className="size-4 pl-0.5" fill="currentColor" />
						)}
					</button>
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{formatRecordingTime(currentTime)} / {formatRecordingTime(duration)}
					</span>
					<div className="min-w-0 flex-1">
						<WaveformSeek
							bars={bars}
							progress={progress}
							duration={duration}
							onSeek={onSeek}
							maxBarHeight={15}
						/>
					</div>
					<button
						type="button"
						className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
						onClick={() => onExpandedChange(true)}
						aria-label="expand"
					>
						<Maximize2 className="size-4" />
					</button>
				</div>
			)}
		</div>
	)
}

function PlayerToggleButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
	const { t } = useTranslation("audioRecordings")
	return (
		<button
			type="button"
			className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground text-background"
			onClick={onToggle}
			aria-label={playing ? t("detail.pause") : t("detail.play")}
			data-testid="recording-detail-player-toggle"
		>
			{playing ? (
				<Pause className="size-6" fill="currentColor" />
			) : (
				<Play className="size-6 pl-0.5" fill="currentColor" />
			)}
		</button>
	)
}

function PlayerGhostButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: ReactNode
}) {
	return (
		<button
			type="button"
			className="mx-auto flex size-10 items-center justify-center rounded-full text-sm hover:bg-muted"
			aria-label={label}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

function WaveformSeek({
	bars,
	progress,
	duration,
	maxBarHeight,
	onSeek,
}: {
	bars: number[]
	progress: number
	duration: number
	maxBarHeight: number
	onSeek: (seconds: number) => void
}) {
	function handleSeek(event: PointerEvent<HTMLButtonElement>) {
		if (!duration) return
		const rect = event.currentTarget.getBoundingClientRect()
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
		onSeek(ratio * duration)
	}

	return (
		<button
			type="button"
			className="flex h-full w-full items-end gap-px"
			onPointerDown={handleSeek}
			aria-label="seek"
		>
			{bars.map((height, index) => {
				const played = (index / bars.length) * 100 <= progress
				return (
					<span
						key={index}
						className={cn(
							"flex-1 rounded-full",
							played ? "bg-foreground" : "bg-muted-foreground/30",
						)}
						style={{ height: `${Math.max(4, height * maxBarHeight)}px` }}
					/>
				)
			})}
		</button>
	)
}

/** Builds deterministic pseudo waveform bars for seek UI without decoding audio. */
function buildStaticWaveformBars(count: number): number[] {
	return Array.from({ length: count }, (_, index) => {
		const wave = Math.sin(index * 0.35) * 0.35 + Math.cos(index * 0.12) * 0.25
		return Math.max(0.15, Math.min(1, 0.55 + wave))
	})
}
