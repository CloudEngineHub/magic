import type { ComponentType } from "react"
import { Check, ChevronLeft, FileAudio, Pencil } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { VoiceResultUtterance } from "@/components/business/VoiceInput/services/VoiceClient/types"
import { formatRecordingDuration } from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"

import { LiveAudioWaveform } from "./LiveAudioWaveform"

type TranscriptMessage = VoiceResultUtterance & { add_time: number; id: string }

interface MobileRecordingSessionPageProps {
	title: string
	duration: string
	isPaused: boolean
	isBusy: boolean
	startupState?: "idle" | "starting" | "error"
	startupErrorMessage?: string
	startupErrorDetail?: string
	transcriptMessages: TranscriptMessage[]
	noteContent: string
	onBack: () => void
	onPause: () => void
	onResume: () => void
	onRetryStart?: () => void
	onFinish: () => void
	onCancel: () => void
	onRenameTitle?: (title: string) => Promise<boolean>
	onNoteChange: (content: string) => void
	WaveformComponent: ComponentType<{ isRecording: boolean; isPaused: boolean }>
	MessageListComponent: ComponentType<{
		message: TranscriptMessage[]
		isExpanded: boolean
		className?: string
	}>
}

type RecordingTopTab = "transcript" | "notes"

function parseHmsDurationToSeconds(duration: string): number {
	const segments = duration.split(":")
	if (segments.length !== 3) return 0

	const [hoursPart, minutesPart, secondsPart] = segments
	const hours = Number(hoursPart)
	const minutes = Number(minutesPart)
	const seconds = Number(secondsPart)

	if (
		!Number.isFinite(hours) ||
		!Number.isFinite(minutes) ||
		!Number.isFinite(seconds) ||
		hours < 0 ||
		minutes < 0 ||
		seconds < 0
	) {
		return 0
	}

	return hours * 3600 + minutes * 60 + seconds
}

/**
 * Renders the full-screen mobile recording experience that mirrors the prototype
 * while still reading transcript, duration, and notes from the shared runtime.
 */
export function MobileRecordingSessionPage({
	title,
	duration,
	isPaused,
	isBusy,
	startupState = "idle",
	startupErrorMessage = "",
	startupErrorDetail = "",
	transcriptMessages,
	noteContent,
	onBack,
	onPause,
	onResume,
	onRetryStart,
	onFinish,
	onRenameTitle,
	onNoteChange,
	MessageListComponent,
}: MobileRecordingSessionPageProps) {
	const { t } = useTranslation("super")
	const [activeTab, setActiveTab] = useState<RecordingTopTab>("transcript")
	const [isEditingTitle, setIsEditingTitle] = useState(false)
	const [draftTitle, setDraftTitle] = useState(title)
	const [isSavingTitle, setIsSavingTitle] = useState(false)
	const titleInputRef = useRef<HTMLInputElement>(null)

	/**
	 * Resets the editable title draft whenever a new shared session/project title
	 * arrives from the runtime so the input always reflects the latest source data.
	 */
	useEffect(() => {
		setDraftTitle(title)
	}, [title])

	/**
	 * Focuses the title input after entering edit mode to keep the rename flow
	 * aligned with the mobile prototype's inline editing interaction.
	 */
	useEffect(() => {
		if (!isEditingTitle) return
		requestAnimationFrame(() => {
			titleInputRef.current?.focus()
			titleInputRef.current?.select()
		})
	}, [isEditingTitle])

	/**
	 * Presents a stable title even before the runtime has created a project name.
	 */
	const resolvedTitle = useMemo(() => {
		if (draftTitle.trim()) return draftTitle.trim()
		return t("mobile.recordingEntry.active.defaultTitle")
	}, [draftTitle, t])

	/**
	 * Reuses the shared recording formatter to keep mobile live-session time
	 * aligned with card/list duration rules (mm:ss under 1h, h:mm:ss at 1h+).
	 */
	const formattedDuration = useMemo(() => {
		return formatRecordingDuration(parseHmsDurationToSeconds(duration))
	}, [duration])

	const isStarting = startupState === "starting"
	const hasStartupError = startupState === "error"

	async function handleTitleCommit() {
		const trimmedTitle = draftTitle.trim()
		if (!trimmedTitle || trimmedTitle === title.trim()) {
			setDraftTitle(title)
			setIsEditingTitle(false)
			return
		}

		if (!onRenameTitle) {
			setDraftTitle(title)
			setIsEditingTitle(false)
			return
		}

		setIsSavingTitle(true)
		try {
			const success = await onRenameTitle(trimmedTitle)
			if (!success) {
				setDraftTitle(title)
			}
		} finally {
			setIsSavingTitle(false)
			setIsEditingTitle(false)
		}
	}

	return (
		<div
			className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background"
			data-testid="mobile-recording-session-page"
		>
			<div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
				<button
					type="button"
					onClick={onBack}
					className="flex size-11 items-center justify-center rounded-full bg-card shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)] transition-opacity active:opacity-70"
					aria-label={t("mobile.recordingEntry.active.backAria")}
					data-testid="mobile-recording-session-back"
				>
					<ChevronLeft className="size-[22px] text-foreground" strokeWidth={2.6} />
				</button>

				<div className="flex min-w-0 flex-1 items-center justify-center gap-2">
					<div className="flex shrink-0 items-center gap-1.5">
						<span
							className={`inline-block size-1.5 shrink-0 rounded-full ${
								isPaused ? "bg-muted-foreground/60" : "bg-[#ef4444]"
							}`}
							style={{
								animation: isPaused
									? undefined
									: "rec-pulse 1.4s ease-in-out infinite",
							}}
							aria-hidden
						/>
						<span
							className={`text-[16px] font-medium leading-5 ${
								isPaused ? "text-muted-foreground/80" : "text-foreground"
							}`}
						>
							{isPaused
								? t("mobile.recordingEntry.active.statusPaused")
								: t("mobile.recordingEntry.active.statusRecording")}
						</span>
					</div>

					<div className="w-[40px] min-w-0 shrink-0" aria-hidden>
						<LiveAudioWaveform
							active={!isPaused}
							height={18}
							barWidth={2}
							barGap={2}
							sampleIntervalMs={60}
							fadeWidth={16}
							fadeColor="var(--color-background)"
						/>
					</div>

					<span className="shrink-0 text-[16px] font-medium tabular-nums leading-5 text-foreground">
						{formattedDuration}
					</span>
				</div>

				<button
					type="button"
					onClick={onFinish}
					disabled={isBusy}
					className="flex size-11 items-center justify-center rounded-full bg-foreground text-background transition-opacity active:opacity-80 disabled:opacity-50"
					aria-label={t("mobile.recordingEntry.active.finishAria")}
					data-testid="mobile-recording-session-finish"
				>
					<Check className="size-[22px]" strokeWidth={2.6} />
				</button>
			</div>

			<div className="flex shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-2">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
					<FileAudio className="size-5 text-muted-foreground" strokeWidth={1.8} />
				</span>

				{isEditingTitle ? (
					<input
						ref={titleInputRef}
						value={draftTitle}
						onChange={(event) => setDraftTitle(event.target.value)}
						onBlur={() => {
							void handleTitleCommit()
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								void handleTitleCommit()
							}
							if (event.key === "Escape") {
								event.preventDefault()
								setDraftTitle(title)
								setIsEditingTitle(false)
							}
						}}
						disabled={isSavingTitle}
						className="min-w-0 flex-1 bg-transparent text-[17px] font-medium leading-6 text-foreground outline-none"
						data-testid="mobile-recording-session-title-input"
					/>
				) : (
					<span className="min-w-0 flex-1 truncate text-[17px] font-medium leading-6 text-foreground">
						{resolvedTitle}
					</span>
				)}

				<button
					type="button"
					onClick={() => setIsEditingTitle(true)}
					disabled={isBusy || isSavingTitle}
					className="flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70"
					aria-label={t("mobile.recordingEntry.active.renameAria")}
					data-testid="mobile-recording-session-title-edit"
				>
					<Pencil className="size-[18px] text-muted-foreground" strokeWidth={1.8} />
				</button>
			</div>

			<div className="flex shrink-0 gap-2 px-4 py-3">
				<button
					type="button"
					onClick={() => setActiveTab("transcript")}
					className={`rounded-full px-4 py-2 text-[14px] font-medium leading-5 transition-all duration-200 ${
						activeTab === "transcript"
							? "bg-foreground text-background shadow-[0px_4px_12px_0px_rgba(0,0,0,0.15)]"
							: "bg-transparent text-muted-foreground"
					}`}
					data-testid="mobile-recording-tab-transcript"
				>
					{t("mobile.recordingEntry.active.tabTranscript")}
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("notes")}
					className={`rounded-full px-4 py-2 text-[14px] font-medium leading-5 transition-all duration-200 ${
						activeTab === "notes"
							? "bg-foreground text-background shadow-[0px_4px_12px_0px_rgba(0,0,0,0.15)]"
							: "bg-transparent text-muted-foreground"
					}`}
					data-testid="mobile-recording-tab-notes"
				>
					{t("mobile.recordingEntry.active.tabNotes")}
				</button>
			</div>

			<div className="min-h-0 flex-1 px-4 pb-4">
				<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] bg-card">
					<div className="min-h-0 flex-1">
						{isStarting ? (
							<div
								className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
								data-testid="mobile-recording-session-starting"
							>
								<div className="text-[16px] font-medium leading-6 text-foreground">
									{t("mobile.recordingEntry.active.starting")}
								</div>
								<div className="text-[13px] leading-5 text-muted-foreground">
									{t("mobile.recordingEntry.active.startingHint")}
								</div>
							</div>
						) : hasStartupError ? (
							<div
								className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
								data-testid="mobile-recording-session-start-error"
							>
								<div className="text-[16px] font-medium leading-6 text-foreground">
									{t("mobile.recordingEntry.active.startFailedTitle")}
								</div>
								<div className="text-[13px] leading-5 text-muted-foreground">
									{startupErrorMessage ||
										t("mobile.recordingEntry.active.startFailed")}
								</div>
								{startupErrorDetail ? (
									<div className="max-w-[280px] break-words text-[12px] leading-5 text-muted-foreground/80">
										{startupErrorDetail}
									</div>
								) : null}
							</div>
						) : activeTab === "transcript" ? (
							<MessageListComponent
								message={transcriptMessages}
								isExpanded
								className="h-full"
							/>
						) : (
							<div className="flex h-full flex-col px-4 py-4">
								<textarea
									value={noteContent}
									onChange={(event) => onNoteChange(event.target.value)}
									placeholder={t("mobile.recordingEntry.active.notesPlaceholder")}
									className="min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
									data-testid="mobile-recording-session-notes"
								/>
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="flex min-h-[92px] shrink-0 items-center justify-center px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
				{hasStartupError ? (
					<button
						type="button"
						onClick={onRetryStart}
						disabled={isBusy}
						className="rounded-full bg-card px-8 py-3 text-[15px] font-medium leading-5 text-foreground shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)] transition-opacity active:opacity-70 disabled:opacity-50"
						data-testid="mobile-recording-session-toggle"
					>
						{t("recordingSummary.actions.retry")}
					</button>
				) : isPaused ? (
					/* Resume: capsule-shaped button, centered */
					<button
						key="resume"
						type="button"
						onClick={onResume}
						disabled={isBusy}
						className="flex h-14 items-center justify-center rounded-full px-10 text-[17px] font-semibold transition-opacity active:opacity-70 disabled:opacity-50"
						style={{
							background: "rgba(239, 68, 68, 0.12)",
							color: "#ef4444",
						}}
						data-testid="mobile-recording-session-toggle"
					>
						{t("mobile.recordingEntry.active.resume")}
					</button>
				) : (
					/* Recording: red circular pause button, centered */
					<button
						key="pause"
						type="button"
						onClick={onPause}
						disabled={isBusy || isStarting}
						className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-card transition-opacity active:opacity-70 disabled:opacity-50"
						style={{
							boxShadow:
								"0px 4px 14px 0px rgba(0,0,0,0.18), 0px 0px 0px 1px rgba(0,0,0,0.04)",
						}}
						aria-label={t("mobile.recordingEntry.active.pause")}
						data-testid="mobile-recording-session-toggle"
					>
						<span
							aria-hidden="true"
							className="flex h-14 w-14 items-center justify-center gap-[5px] rounded-full"
							style={{ background: "#ef4444" }}
						>
							<span className="block h-5 w-[4px] rounded-full bg-white" />
							<span className="block h-5 w-[4px] rounded-full bg-white" />
						</span>
					</button>
				)}
			</div>

			<style>{`
				@keyframes rec-pulse {
					0%, 100% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.4); opacity: 0.5; }
				}
			`}</style>
		</div>
	)
}
