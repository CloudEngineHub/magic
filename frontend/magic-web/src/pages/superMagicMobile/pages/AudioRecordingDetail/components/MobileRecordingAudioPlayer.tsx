import type { PointerEvent, ReactNode, RefObject } from "react"
import { useMemo } from "react"
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw } from "lucide-react"
import { useTranslation } from "react-i18next"
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
}: MobileRecordingAudioPlayerProps) {
	const { t } = useTranslation("audioRecordings")
	const bars = useMemo(() => buildStaticWaveformBars(144), [])

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
						<span>{formatRecordingTime(currentTime)}</span>
						<span>{formatRecordingTime(duration)}</span>
					</div>
					<div className="grid grid-cols-5 items-center gap-1">
						<div className="flex justify-center">
							<span className="rounded-full px-3 py-2 text-[14px] font-medium tabular-nums">
								1.0x
							</span>
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="-15s"
								icon={<RotateCcw className="size-4" />}
								onClick={() => onSeek(Math.max(0, currentTime - 15))}
							/>
						</div>
						<div className="flex justify-center">
							<PlayerToggleButton playing={playing} onToggle={onToggle} />
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="+15s"
								icon={<RotateCw className="size-4" />}
								onClick={() => onSeek(Math.min(duration, currentTime + 15))}
							/>
						</div>
						<div className="flex justify-center">
							<PlayerGhostButton
								label="collapse"
								icon={<ChevronDown className="size-4" />}
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
						<ChevronUp className="size-4" />
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
			className="flex size-10 items-center justify-center rounded-full active:bg-muted"
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
