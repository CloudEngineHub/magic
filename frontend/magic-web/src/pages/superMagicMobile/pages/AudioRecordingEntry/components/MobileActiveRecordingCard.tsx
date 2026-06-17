import { Pause, Play, Square } from "lucide-react"
import { useTranslation } from "react-i18next"
import { LiveAudioWaveform } from "./LiveAudioWaveform"

interface MobileActiveRecordingCardProps {
	title: string
	duration: string
	isPaused: boolean
	isBusy: boolean
	onOpen: () => void
	onPause: () => void
	onResume: () => void
	onFinish: () => void
}

/**
 * Shows the H5 mobile in-progress active recording card at the top of the list.
 * Fully refined to match the high-fidelity prototype (background-mix, canvas rolling wave, custom shadow buttons).
 */
export function MobileActiveRecordingCard({
	title,
	duration,
	isPaused,
	isBusy,
	onOpen,
	onPause,
	onResume,
	onFinish,
}: MobileActiveRecordingCardProps) {
	const { t } = useTranslation(["super", "audioRecordings"])

	/**
	 * Switches the bottom compact control between pause and resume states.
	 */
	function handleTogglePause() {
		if (isBusy) return
		if (isPaused) {
			onResume()
			return
		}
		onPause()
	}

	const sourceLabel =
		title === "MagicCard-001" || title.includes("MagicCard")
			? title
			: t("audioRecordings:card.sourceRecorded")

	const stateLabel = isPaused
		? t("super:mobile.recordingEntry.active.statusPaused")
		: t("super:mobile.recordingEntry.active.statusRecording")

	// Calculate background color dynamically using color-mix to align with high-fidelity specs
	const bgColor = isPaused
		? "color-mix(in srgb, var(--color-muted-foreground, #71717a) 8%, var(--color-card, #ffffff))"
		: "color-mix(in srgb, var(--color-foreground, #09090b) 5%, var(--color-card, #ffffff))"

	return (
		<div
			className="relative flex shrink-0 flex-col overflow-hidden rounded-2xl transition-[background-color] duration-300"
			style={{
				background: bgColor,
				border: "1px solid var(--color-border, #e4e4e7)",
				boxShadow: "0px 4px 14px 0px rgba(0,0,0,0.05)",
			}}
			data-testid="mobile-active-recording-card"
		>
			{/* Top metadata row: status dot + status text + source label + elapsed duration */}
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-center gap-1.5 px-3.5 pb-1 pt-3.5 text-left active:opacity-80"
				data-testid="mobile-active-recording-open"
			>
				<span
					className="inline-block size-1.5 shrink-0 rounded-full"
					style={{
						background: isPaused ? "var(--color-muted-foreground)" : "var(--color-destructive, #ef4444)",
						animation: isPaused ? undefined : "recording-pulse 1.4s ease-in-out infinite",
					}}
					aria-hidden
				/>
				<span
					className="text-[12px] font-medium leading-4"
					style={{ color: isPaused ? "var(--color-muted-foreground)" : "var(--color-foreground)" }}
				>
					{stateLabel}
				</span>
				<span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-muted-foreground">
					· {sourceLabel}
				</span>
				<span className="ml-auto shrink-0 font-poppins text-[13px] font-medium tabular-nums leading-4 text-foreground">
					{duration}
				</span>
			</button>

			{/* Main control row: canvas rolling waveform + high-fidelity circular projection buttons */}
			<div className="flex items-center gap-2 px-3.5 pb-3.5 pt-1">
				<button
					type="button"
					onClick={onOpen}
					className="min-w-0 flex-1 text-left active:opacity-80"
					style={{
						color: isPaused
							? "color-mix(in oklch, var(--color-muted-foreground) 70%, transparent)"
							: "var(--color-foreground)",
					}}
					aria-label={t("super:mobile.recordingEntry.active.backAria")}
				>
					<LiveAudioWaveform
						active={!isPaused}
						height={28}
						barWidth={2}
						barGap={2}
						sampleIntervalMs={60}
						fadeWidth={16}
						fadeColor={bgColor}
					/>
				</button>

				<button
					type="button"
					onClick={handleTogglePause}
					disabled={isBusy}
					className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card shadow-[0px_1px_4px_0px_rgba(0,0,0,0.06)] transition-opacity active:opacity-70 disabled:opacity-50"
					aria-label={isPaused ? t("super:mobile.recordingEntry.active.resume") : t("super:mobile.recordingEntry.active.pause")}
					data-testid="mobile-active-recording-toggle"
				>
					{isPaused ? (
						<Play className="size-3.5 text-foreground" fill="currentColor" />
					) : (
						<Pause className="size-3.5 text-foreground" fill="currentColor" />
					)}
				</button>

				<button
					type="button"
					onClick={onFinish}
					disabled={isBusy}
					className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-[0px_1px_4px_0px_rgba(0,0,0,0.10)] transition-opacity active:opacity-80 disabled:opacity-50"
					aria-label={t("super:mobile.recordingEntry.active.finishAria")}
					data-testid="mobile-active-recording-finish"
				>
					<Square className="size-3 text-background" fill="currentColor" />
				</button>
			</div>

			<style>{`
				@keyframes recording-pulse {
					0%, 100% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.4); opacity: 0.5; }
				}
			`}</style>
		</div>
	)
}

