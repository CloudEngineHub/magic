import { memo, type ComponentType } from "react"
import {
	AudioLines,
	Bluetooth,
	CheckCircle2,
	Clock,
	Ellipsis,
	FileAudio,
	Loader,
	Smartphone,
	Sparkles,
	Upload,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { AudioProjectListItem } from "@/types/audioProject"
import {
	formatRecordingDuration,
	parseAudioProjectTimestamp,
	resolveRecordingDisplayName,
	resolveRecordingSourceLabel,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"
import {
	canClickSummaryButton,
	getSummaryButtonVariant,
	shouldShowSummaryButton,
} from "@/pages/superMagic/pages/AudioRecordings/utils/summary-action-utils"
import { formatRelativeTime } from "@/utils/string"

interface MobileRecordingCardProps {
	item: AudioProjectListItem
	onOpen?: (item: AudioProjectListItem) => void
	onSummarize?: (item: AudioProjectListItem) => void
	onMore?: (item: AudioProjectListItem) => void
	isSubmitting?: boolean
}

/** Outlined status chip for summarized recordings (prototype ChipOutline) */
function ChipOutline(props: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>
	children: React.ReactNode
}) {
	const { icon: Icon, children } = props

	return (
		<span
			className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium leading-4 text-foreground"
			style={{ border: "1px solid rgb(var(--border-rgb))" }}
		>
			<Icon className="size-3.5" strokeWidth={1.8} />
			{children}
		</span>
	)
}

/** Muted chip for source metadata (prototype ChipMuted) */
function ChipMuted(props: {
	icon: ComponentType<{ className?: string; strokeWidth?: number }>
	children: React.ReactNode
}) {
	const { icon: Icon, children } = props

	return (
		<span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 text-[12px] font-medium leading-4 text-muted-foreground">
			<Icon className="size-3.5" strokeWidth={1.8} />
			{children}
		</span>
	)
}

const relativeTimeFormatter = formatRelativeTime()

/** Picks the source icon shown beside the recording origin chip */
function resolveSourceIcon(item: AudioProjectListItem) {
	if (item.device_id?.trim()) return Bluetooth
	if (item.audio_source === "imported") return Upload
	return Smartphone
}

/**
 * Prototype-aligned recording card: three rows (title, meta, chips + CTA + more).
 * Summary status follows prototype — only "summarized" gets a chip; pending/generating use CTA buttons.
 */
export const MobileRecordingCard = memo(function MobileRecordingCard({
	item,
	onOpen,
	onSummarize,
	onMore,
	isSubmitting = false,
}: MobileRecordingCardProps) {
	const { t } = useTranslation("audioRecordings")

	const title = resolveRecordingDisplayName(item.project_name, item.created_at)
	const createdSeconds = parseAudioProjectTimestamp(item.created_at)
	const timeLabel = createdSeconds != null ? relativeTimeFormatter(createdSeconds) : ""
	const durationLabel = formatRecordingDuration(item.duration ?? 0)
	const sourceLabel = resolveRecordingSourceLabel(item, {
		sourceRecorded: t("card.sourceRecorded"),
		sourceImported: t("card.sourceImported"),
		sourceDevice: t("card.sourceDevice"),
	})
	const SourceIcon = resolveSourceIcon(item)

	const isSummarized = item.card_status === "summarized"
	const isSummarizing =
		item.card_status === "summarizing" ||
		(item.current_phase === "summarizing" && item.phase_status === "in_progress")
	const showSummaryButton = shouldShowSummaryButton(item.current_phase, item.phase_status)
	const summaryVariant = getSummaryButtonVariant(item.current_phase, item.phase_status)
	const canClickSummary = canClickSummaryButton(
		item.current_phase,
		item.phase_status,
		isSubmitting,
	)

	function resolveSummaryLabel() {
		if (isSummarizing || isSubmitting) return t("card.summarizing")
		if (summaryVariant === "retry") return t("card.retrySummary")
		return t("card.generateSummary")
	}

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen?.(item)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					onOpen?.(item)
				}
			}}
			className="flex flex-col gap-2.5 rounded-2xl bg-card px-3.5 py-3.5 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.06)]"
			data-testid={`mobile-recording-card-${item.id}`}
		>
			<div className="flex items-center gap-2.5">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
					<FileAudio className="size-[18px] text-foreground" strokeWidth={1.8} />
				</div>
				<p className="min-w-0 flex-1 truncate text-[16px] font-medium leading-5 text-foreground">
					{title}
				</p>
			</div>

			<div className="flex items-center justify-between gap-2 text-[13px] leading-5 text-muted-foreground">
				{timeLabel ? (
					<span className="inline-flex min-w-0 items-center gap-1">
						<Clock className="size-3.5 shrink-0" strokeWidth={1.8} />
						<span className="truncate">{timeLabel}</span>
					</span>
				) : (
					<span />
				)}
				<span className="inline-flex shrink-0 items-center gap-1">
					<AudioLines className="size-3.5" strokeWidth={1.8} />
					<span className="tabular-nums">{durationLabel}</span>
				</span>
			</div>

			<div className="mt-0.5 flex items-center gap-1.5">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
					{isSummarized ? (
						<ChipOutline icon={CheckCircle2}>{t("card.summarized")}</ChipOutline>
					) : null}
					<ChipMuted icon={SourceIcon}>{sourceLabel}</ChipMuted>
				</div>

				{showSummaryButton && !isSummarizing ? (
					<button
						type="button"
						disabled={!canClickSummary}
						onClick={(event) => {
							event.stopPropagation()
							if (!canClickSummary) return
							onSummarize?.(item)
						}}
						className={cn(
							"inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground px-3 text-[13px] font-medium leading-5 text-background transition-opacity active:opacity-80",
							!canClickSummary && "opacity-60",
						)}
						data-testid={`mobile-recording-card-summarize-${item.id}`}
					>
						{isSubmitting ? (
							<Loader className="size-3.5 animate-spin" strokeWidth={2} />
						) : (
							<Sparkles className="size-3.5" strokeWidth={2} />
						)}
						{resolveSummaryLabel()}
					</button>
				) : null}

				{isSummarizing ? (
					<button
						type="button"
						disabled
						className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground px-3 text-[13px] font-medium leading-5 text-background opacity-50"
						data-testid={`mobile-recording-card-summarize-${item.id}`}
					>
						<Loader className="size-3.5 animate-spin" strokeWidth={2} />
						{t("card.summarizing")}
					</button>
				) : null}

				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation()
						onMore?.(item)
					}}
					className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full active:bg-foreground/[0.06]"
					aria-label={t("card.moreActions")}
					data-testid={`mobile-recording-card-more-${item.id}`}
				>
					<Ellipsis className="size-5 text-muted-foreground" />
				</button>
			</div>
		</div>
	)
})
