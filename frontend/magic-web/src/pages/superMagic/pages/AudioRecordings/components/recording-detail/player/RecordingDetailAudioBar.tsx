import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { ChevronDown, Maximize2, Minimize2, Pause, Play } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { formatRecordingTime } from "../../../utils/time"
import type { FlatColorSegment } from "../../../utils/chapter-color-segments"
import { buildSimulatedWaveformBars } from "../../../utils/simulated-waveform-bars"
import { LiveAudioWaveformSeek } from "./LiveAudioWaveformSeek"
import { SkipBack15Icon, SkipForward15Icon } from "./player-icons"

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const
export const PLAYBACK_SKIP_SEC = 15

const GHOST_CONTROL_BTN =
	"flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90"

export type RecordingDetailAudioBarChrome = "shadow" | "outlined"

interface RecordingDetailAudioBarProps {
	audioRef: RefObject<HTMLAudioElement>
	audioUrl: string
	durationSec: number
	currentSec: number
	playing: boolean
	expanded: boolean
	rate: number
	peakNorms?: number[]
	colorSegments?: FlatColorSegment[]
	chrome?: RecordingDetailAudioBarChrome
	scrollSignal?: number
	onExpandedChange: (expanded: boolean) => void
	onTogglePlay: () => void
	onSeek: (sec: number) => void
	onPlaybackRateChange: (rate: number) => void
	onSkipBack?: () => void
	onSkipForward?: () => void
}

/** Formats seconds as HH:MM:SS for the expanded player time row. */
function formatHMS(sec: number): string {
	const t = Math.max(0, sec)
	const h = Math.floor(t / 3600)
	const m = Math.floor((t % 3600) / 60)
	const s = Math.floor(t % 60)
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** Formats playback rate labels consistently across the rate menu. */
function formatPlaybackRateLabel(rate: number): string {
	if (rate === 1 || rate === 2) return rate.toFixed(1)
	return String(rate)
}

/**
 * Shared recording detail audio bar used by PC and mobile shells.
 * Visual and interaction behavior align with the product prototype.
 */
export function RecordingDetailAudioBar({
	audioRef,
	audioUrl,
	durationSec,
	currentSec,
	playing,
	expanded,
	rate,
	peakNorms: peakNormsOverride,
	colorSegments,
	chrome = "shadow",
	scrollSignal = 0,
	onExpandedChange,
	onTogglePlay,
	onSeek,
	onPlaybackRateChange,
	onSkipBack,
	onSkipForward,
}: RecordingDetailAudioBarProps) {
	const { t } = useTranslation("audioRecordings")
	const [rateMenuOpen, setRateMenuOpen] = useState(false)
	const rateMenuWrapRef = useRef<HTMLDivElement>(null)
	const peakNorms = useMemo(
		() => peakNormsOverride ?? buildSimulatedWaveformBars(),
		[peakNormsOverride],
	)

	const duration = Math.max(0, durationSec)
	const waveformMaxPx = expanded ? 52 : 15
	const seekKeyboardStep = expanded ? PLAYBACK_SKIP_SEC : 5

	/** Default ±15s skip when shells do not override skip handlers. */
	function handleSkipBack() {
		if (onSkipBack) {
			onSkipBack()
			return
		}
		onSeek(Math.max(0, currentSec - PLAYBACK_SKIP_SEC))
	}

	function handleSkipForward() {
		if (onSkipForward) {
			onSkipForward()
			return
		}
		onSeek(Math.min(duration, currentSec + PLAYBACK_SKIP_SEC))
	}

	useEffect(() => {
		if (!expanded) setRateMenuOpen(false)
	}, [expanded])

	useEffect(() => {
		if (scrollSignal > 0) setRateMenuOpen(false)
	}, [scrollSignal])

	useEffect(() => {
		if (!rateMenuOpen) return

		function onDocDown(event: MouseEvent) {
			const el = rateMenuWrapRef.current
			if (el && !el.contains(event.target as Node)) setRateMenuOpen(false)
		}

		function onKey(event: KeyboardEvent) {
			if (event.key === "Escape") setRateMenuOpen(false)
		}

		document.addEventListener("mousedown", onDocDown)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("mousedown", onDocDown)
			document.removeEventListener("keydown", onKey)
		}
	}, [rateMenuOpen])

	const shellClassName =
		chrome === "outlined"
			? "shrink-0 rounded-2xl border border-border shadow-none"
			: "shrink-0 rounded-2xl shadow-[0px_12px_32px_0px_rgba(0,0,0,0.14)]"
	const innerClassName = `rounded-2xl bg-card ${expanded ? "overflow-visible" : "overflow-hidden"}`
	const minimizedControlsClassName = "flex items-center gap-1.5 px-3 py-1.5"
	const expandedControlsClassName = "flex flex-col gap-3 px-3 pb-3.5 pt-3"

	return (
		<div className={shellClassName} data-testid="recording-detail-audio-bar">
			<div className={innerClassName}>
				<audio ref={audioRef} src={audioUrl} preload="metadata" />
				{!expanded ? (
					<div className={minimizedControlsClassName}>
						<button
							type="button"
							onClick={onTogglePlay}
							className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background active:opacity-80"
							aria-label={playing ? t("detail.pause") : t("detail.play")}
							data-testid="recording-detail-player-toggle"
						>
							{playing ? (
								<Pause className="size-4" fill="currentColor" />
							) : (
								<Play className="size-4 pl-0.5" fill="currentColor" />
							)}
						</button>
						<span className="shrink-0 text-[12px] tabular-nums leading-4 text-muted-foreground">
							{formatRecordingTime(currentSec)} / {formatRecordingTime(duration)}
						</span>
						<div className="min-w-0 flex-1">
							<LiveAudioWaveformSeek
								durationSec={duration}
								currentSec={currentSec}
								peakNorms={peakNorms}
								maxBarPx={waveformMaxPx}
								paused={!playing}
								onSeek={onSeek}
								ariaLabel={t("detail.player.waveformSeekAria")}
								seekKeyboardStep={seekKeyboardStep}
								colorSegments={colorSegments}
							/>
						</div>
						<button
							type="button"
							onClick={() => onExpandedChange(true)}
							className="flex size-7 shrink-0 items-center justify-center rounded-full active:bg-foreground/[0.06]"
							aria-label={t("detail.player.expandPlayerAria")}
						>
							<Maximize2 className="size-5 text-foreground" strokeWidth={1.25} />
						</button>
					</div>
				) : (
					<div className={expandedControlsClassName}>
						<LiveAudioWaveformSeek
							durationSec={duration}
							currentSec={currentSec}
							peakNorms={peakNorms}
							maxBarPx={waveformMaxPx}
							paused={!playing}
							onSeek={onSeek}
							ariaLabel={t("detail.player.waveformSeekAria")}
							seekKeyboardStep={seekKeyboardStep}
							colorSegments={colorSegments}
						/>
						<div className="flex items-center justify-between text-[13px] tabular-nums text-muted-foreground">
							<span>{formatHMS(currentSec)}</span>
							<span>{formatHMS(duration)}</span>
						</div>
						<div className="grid w-full grid-cols-5 items-center gap-1 pt-0.5">
							<div className="relative flex justify-center" ref={rateMenuWrapRef}>
								<button
									type="button"
									onClick={() => setRateMenuOpen((open) => !open)}
									className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-[14px] font-medium tabular-nums text-foreground transition-colors hover:bg-muted/70 active:bg-muted/90"
									aria-label={t("detail.player.playbackRateMenuAria")}
									aria-expanded={rateMenuOpen}
									aria-haspopup="listbox"
								>
									{t("detail.player.playbackSpeed", {
										rate: formatPlaybackRateLabel(rate),
									})}
									<ChevronDown
										className={cn(
											"size-4 shrink-0 opacity-70 transition-transform",
											rateMenuOpen && "rotate-180",
										)}
										strokeWidth={2}
									/>
								</button>
								{rateMenuOpen ? (
									<div
										role="listbox"
										aria-label={t("detail.player.playbackRateMenuAria")}
										className="absolute bottom-full left-0 z-50 mb-1 min-w-[9.5rem] rounded-xl border border-border bg-card py-1 shadow-md"
									>
										{PLAYBACK_RATES.map((playbackRate) => (
											<button
												key={playbackRate}
												type="button"
												role="option"
												aria-selected={playbackRate === rate}
												onClick={() => {
													onPlaybackRateChange(playbackRate)
													setRateMenuOpen(false)
												}}
												className={cn(
													"flex w-full items-center px-3 py-2 text-left text-[14px] tabular-nums transition-colors hover:bg-muted/80",
													playbackRate === rate
														? "bg-muted/70 font-medium text-foreground"
														: "text-foreground",
												)}
											>
												{t("detail.player.playbackSpeed", {
													rate: formatPlaybackRateLabel(playbackRate),
												})}
											</button>
										))}
									</div>
								) : null}
							</div>
							<div className="flex justify-center">
								<button
									type="button"
									onClick={handleSkipBack}
									className={GHOST_CONTROL_BTN}
									aria-label={t("detail.player.skipBackAria")}
								>
									<SkipBack15Icon />
								</button>
							</div>
							<div className="flex justify-center">
								<button
									type="button"
									onClick={onTogglePlay}
									className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-background active:opacity-90"
									aria-label={playing ? t("detail.pause") : t("detail.play")}
									data-testid="recording-detail-player-toggle"
								>
									{playing ? (
										<Pause className="size-7" fill="currentColor" />
									) : (
										<Play className="size-7 pl-1" fill="currentColor" />
									)}
								</button>
							</div>
							<div className="flex justify-center">
								<button
									type="button"
									onClick={handleSkipForward}
									className={GHOST_CONTROL_BTN}
									aria-label={t("detail.player.skipForwardAria")}
								>
									<SkipForward15Icon />
								</button>
							</div>
							<div className="flex justify-center">
								<button
									type="button"
									onClick={() => onExpandedChange(false)}
									className={GHOST_CONTROL_BTN}
									aria-label={t("detail.player.collapsePlayerAria")}
								>
									<Minimize2 className="size-5" strokeWidth={1.25} />
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
