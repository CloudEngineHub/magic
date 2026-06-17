import type { PointerEvent, ReactNode, RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Maximize2, Minimize2, Pause, Play } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { formatRecordingTime } from "../utils/time"

interface MobileRecordingAudioPlayerProps {
	audioRef: RefObject<HTMLAudioElement>
	audioUrl: string
	currentTime: number
	duration: number
	progress: number
	playing: boolean
	expanded: boolean
	onToggle: () => void
	onSeek: (seconds: number) => void
	onExpandedChange: (expanded: boolean) => void
	playbackRate?: number
	onPlaybackRateChange?: (rate: number) => void
}

const PLAYBACK_RATES = [1.0, 1.25, 1.5, 2.0] as const

function formatPlaybackRateLabel(rate: number): string {
	if (rate === 1 || rate === 2) return rate.toFixed(1)
	return String(rate)
}

/** Formats a duration in seconds into HH:MM:SS. */
function formatHMS(sec: number): string {
	const t = Math.max(0, sec)
	const h = Math.floor(t / 3600)
	const m = Math.floor((t % 3600) / 60)
	const s = Math.floor(t % 60)
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Custom SVG for Skip Back 15s with '15' inside the arrow path. */
function SkipBack15Icon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={20}
			height={20}
			viewBox="0 0 20 20"
			fill="none"
			className={className}
			aria-hidden
		>
			<path
				d="M6.66659 16.6667H8.33325C8.55427 16.6667 8.76623 16.5789 8.92251 16.4226C9.07879 16.2663 9.16659 16.0543 9.16659 15.8333V15C9.16659 14.779 9.07879 14.567 8.92251 14.4107C8.76623 14.2545 8.55427 14.1667 8.33325 14.1667H6.66659V11.6667H9.16659M12.4999 15C13.826 15 15.0978 14.4732 16.0355 13.5355C16.9731 12.5979 17.4999 11.3261 17.4999 10C17.4999 8.67392 16.9731 7.40215 16.0355 6.46447C15.0978 5.52678 13.826 5 12.4999 5H3.33325M3.33325 5L5.83325 7.5M3.33325 5L5.83325 2.5M4.16659 11.6667V16.6667"
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/** Custom SVG for Skip Forward 15s with '15' inside the arrow path. */
function SkipForward15Icon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={20}
			height={20}
			viewBox="0 0 20 20"
			fill="none"
			className={className}
			aria-hidden
		>
			<path
				d="M14.1667 7.5L16.6667 5M16.6667 5L14.1667 2.5M16.6667 5H7.5C6.17392 5 4.90215 5.52678 3.96447 6.46447C3.02678 7.40215 2.5 8.67392 2.5 10C2.5 11.3261 3.02678 12.5979 3.96447 13.5355C4.90215 14.4732 6.17392 15 7.5 15M13.3333 16.6667H15C15.221 16.6667 15.433 16.5789 15.5893 16.4226C15.7455 16.2663 15.8333 16.0543 15.8333 15.8333V15C15.8333 14.779 15.7455 14.567 15.5893 14.4107C15.433 14.2545 15.221 14.1667 15 14.1667H13.3333V11.6667H15.8333M10.8333 11.6667V16.6667"
				stroke="currentColor"
				strokeWidth={1.25}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/** Sticky mobile player bound to the shared audio element used across source and summary panels. */
export function MobileRecordingAudioPlayer({
	audioRef,
	audioUrl,
	currentTime,
	duration,
	progress,
	playing,
	expanded,
	onToggle,
	onSeek,
	onExpandedChange,
	playbackRate = 1.0,
	onPlaybackRateChange,
}: MobileRecordingAudioPlayerProps) {
	const { t } = useTranslation("audioRecordings")
	const [rateMenuOpen, setRateMenuOpen] = useState(false)
	const rateMenuWrapRef = useRef<HTMLDivElement>(null)
	const bars = useMemo(() => buildStaticWaveformBars(144), [])

	useEffect(() => {
		if (!expanded) setRateMenuOpen(false)
	}, [expanded])

	useEffect(() => {
		if (!rateMenuOpen) return
		const onDocDown = (e: MouseEvent) => {
			const el = rateMenuWrapRef.current
			if (el && !el.contains(e.target as Node)) setRateMenuOpen(false)
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setRateMenuOpen(false)
		}
		document.addEventListener("mousedown", onDocDown)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("mousedown", onDocDown)
			document.removeEventListener("keydown", onKey)
		}
	}, [rateMenuOpen])

	if (!audioUrl) return null

	return (
		<div
			className="fixed inset-x-3 bottom-3 z-20 rounded-2xl bg-card shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
			data-testid="mobile-recording-audio-player"
		>
			<audio ref={audioRef} src={audioUrl} preload="metadata" />
			{expanded ? (
				<div className="flex flex-col gap-3 px-3 pb-3.5 pt-3">
					<WaveformSeek
						bars={bars}
						progress={progress}
						duration={duration}
						onSeek={onSeek}
						maxBarHeight={48}
					/>
					<div className="flex items-center justify-between text-[13px] tabular-nums text-muted-foreground">
						<span>{formatHMS(currentTime)}</span>
						<span>{formatHMS(duration)}</span>
					</div>
					<div className="grid grid-cols-5 items-center gap-1 pt-0.5">
						<div className="relative flex justify-center" ref={rateMenuWrapRef}>
							<button
								type="button"
								onClick={() => setRateMenuOpen((o) => !o)}
								className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[14px] font-medium tabular-nums text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90"
								aria-label="Speed"
								aria-expanded={rateMenuOpen}
								aria-haspopup="listbox"
							>
								{formatPlaybackRateLabel(playbackRate)}x
								<ChevronDown
									className={cn(
										"size-4 shrink-0 opacity-70 transition-transform",
										rateMenuOpen && "rotate-180",
									)}
									strokeWidth={2}
								/>
							</button>
							{rateMenuOpen && (
								<div
									role="listbox"
									className="absolute bottom-full left-0 z-50 mb-1 min-w-[9.5rem] rounded-xl border border-border bg-card py-1 shadow-md"
								>
									{PLAYBACK_RATES.map((r) => (
										<button
											key={r}
											type="button"
											role="option"
											aria-selected={r === playbackRate}
											onClick={() => {
												onPlaybackRateChange?.(r)
												setRateMenuOpen(false)
											}}
											className={cn(
												"flex w-full items-center px-3 py-2 text-left text-[14px] tabular-nums transition-colors hover:bg-muted/80",
												r === playbackRate
													? "bg-muted/70 font-medium text-foreground"
													: "text-foreground",
											)}
										>
											{formatPlaybackRateLabel(r)}x
										</button>
									))}
								</div>
							)}
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="-15s"
								icon={<SkipBack15Icon />}
								onClick={() => onSeek(Math.max(0, currentTime - 15))}
							/>
						</div>
						<div className="flex justify-center">
							<PlayerToggleButton playing={playing} onToggle={onToggle} />
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="+15s"
								icon={<SkipForward15Icon />}
								onClick={() => onSeek(Math.min(duration, currentTime + 15))}
							/>
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="collapse"
								icon={<Minimize2 className="size-5" strokeWidth={1.25} />}
								onClick={() => onExpandedChange(false)}
							/>
						</div>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-1.5 px-3 py-1.5">
					<button
						type="button"
						className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background active:opacity-80"
						onClick={onToggle}
						aria-label={playing ? t("detail.pause") : t("detail.play")}
						data-testid="mobile-recording-player-toggle"
					>
						{playing ? (
							<Pause className="size-4" fill="currentColor" />
						) : (
							<Play className="size-4 pl-0.5" fill="currentColor" />
						)}
					</button>
					<span className="shrink-0 text-[12px] tabular-nums leading-4 text-muted-foreground">
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
						className="flex size-7 shrink-0 items-center justify-center rounded-full active:bg-muted"
						onClick={() => onExpandedChange(true)}
						aria-label="expand"
					>
						<Maximize2 className="size-5 text-foreground" strokeWidth={1.25} />
					</button>
				</div>
			)}
		</div>
	)
}

/** Primary play/pause button used in the expanded player controls. */
function PlayerToggleButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
	const { t } = useTranslation("audioRecordings")

	return (
		<button
			type="button"
			className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-background active:opacity-90"
			onClick={onToggle}
			aria-label={playing ? t("detail.pause") : t("detail.play")}
			data-testid="mobile-recording-player-toggle"
		>
			{playing ? (
				<Pause className="size-7" fill="currentColor" />
			) : (
				<Play className="size-7 pl-1" fill="currentColor" />
			)}
		</button>
	)
}

/** Small icon control for secondary player actions such as skip and collapse. */
function PlayerGhostButton({
	label,
	icon,
	onClick,
}: {
	label: string
	icon: ReactNode
	onClick: () => void
}) {
	return (
		<button
			type="button"
			className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90"
			aria-label={label}
			onClick={onClick}
		>
			{icon}
		</button>
	)
}

/** Waveform-like seek control that gives the preview the same rhythm as the prototype. */
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
	/** Converts a pointer position into seconds without depending on native range styling. */
	function handleSeek(event: PointerEvent<HTMLButtonElement>) {
		const rect = event.currentTarget.getBoundingClientRect()
		const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
		onSeek(Math.max(0, Math.min(duration, duration * ratio)))
	}

	return (
		<button
			type="button"
			className="flex w-full items-center gap-px overflow-hidden px-0.5"
			style={{ height: maxBarHeight + 8 }}
			onPointerDown={handleSeek}
			aria-label="seek"
		>
			{bars.map((bar, index) => {
				const active = index / Math.max(1, bars.length - 1) <= progress / 100
				return (
					<span
						key={`${bar}-${index}`}
						className={active ? "bg-[#8fc4e8]" : "bg-border"}
						style={{
							height: Math.max(2, Math.round(bar * maxBarHeight)),
							flex: "1 1 0",
							minWidth: 1,
						}}
					/>
				)
			})}
		</button>
	)
}

/** Builds deterministic pseudo-waveform bars so the preview has visual texture before real peaks exist. */
function buildStaticWaveformBars(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const waveA = Math.sin(index * 0.58) * 0.5 + 0.5
		const waveB = Math.sin(index * 0.17 + 1.7) * 0.5 + 0.5
		return 0.22 + waveA * 0.45 + waveB * 0.25
	})
}
