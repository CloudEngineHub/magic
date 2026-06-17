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
	AlertTriangle,
	CloudUpload,
	RefreshCw,
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
import { formatRelativeTime } from "@/utils/string"

interface MobileRecordingCardProps {
	item: AudioProjectListItem
	onOpen?: (item: AudioProjectListItem) => void
	onSummarize?: (item: AudioProjectListItem) => void
	onMore?: (item: AudioProjectListItem) => void
	onRetry?: (item: AudioProjectListItem) => void
	isSubmitting?: boolean
}

interface LinearProgressProps {
	value: number
	tone?: "default" | "destructive"
	indeterminate?: boolean
	height?: number
}

function LinearProgress({
	value,
	tone = "default",
	indeterminate = false,
	height = 6,
}: LinearProgressProps) {
	const pct = Math.max(0, Math.min(1, value)) * 100
	const fg = tone === "destructive" ? "rgb(239, 68, 68)" : "rgb(59, 130, 246)"

	return (
		<div
			className="w-full overflow-hidden rounded-full"
			style={{
				height,
				background: "rgba(100, 116, 139, 0.18)",
			}}
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(pct)}
		>
			<div
				className="h-full rounded-full transition-[width] duration-300 ease-out"
				style={{
					width: `${pct}%`,
					backgroundColor: fg,
					backgroundImage: indeterminate
						? `repeating-linear-gradient(45deg, ${fg} 0 8px, rgba(255, 255, 255, 0.15) 8px 16px)`
						: undefined,
					backgroundSize: indeterminate ? "32px 32px" : undefined,
					animation: indeterminate
						? "linear-progress-stripes 0.9s linear infinite"
						: undefined,
				}}
			/>
			{indeterminate && (
				<style>{`
					@keyframes linear-progress-stripes {
						from { background-position: 0 0; }
						to   { background-position: 32px 0; }
					}
				`}</style>
			)}
		</div>
	)
}

interface ProgressMetaProps {
	isTransferFailed: boolean
	pctText: number
}

function ProgressMeta({ isTransferFailed, pctText }: ProgressMetaProps) {
	const { t } = useTranslation("super")

	let label = ""
	let color = ""
	let Icon = CloudUpload

	if (isTransferFailed) {
		label = t("recordingEntry.progress.transferFailed", { defaultValue: "上传失败" })
		color = "rgb(239, 68, 68)"
		Icon = AlertTriangle
	} else {
		label = t("recordingEntry.progress.uploading", { defaultValue: "正在上传" })
		color = "rgb(59, 130, 246)"
		Icon = CloudUpload
	}

	return (
		<div className="flex items-center justify-between gap-2 text-[13px] leading-5">
			<span
				className="inline-flex min-w-0 items-center gap-1.5 font-medium"
				style={{ color }}
			>
				<Icon className="size-3.5 shrink-0" strokeWidth={1.8} />
				<span className="truncate">{label}</span>
			</span>
			<span className="shrink-0 font-semibold tabular-nums" style={{ color }}>
				{pctText}%
			</span>
		</div>
	)
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

/** Picks the source icon based on extra.source:
 * - 'device': Bluetooth/external recorder → Bluetooth icon
 * - 'app' or fallback: recorded from mobile app → Smartphone icon
 * Note: 'imported' audio_source keeps Upload icon regardless of source field
 */
function resolveSourceIcon(item: AudioProjectListItem) {
	if (item.audio_source === "imported") return Upload
	if (item.source === "device") return Bluetooth
	return Smartphone
}

/** Resolves card duration label: valid seconds are formatted, otherwise show static fallback. */
function resolveCardDurationLabel(item: AudioProjectListItem): string {
	const hasValidDuration = Number.isFinite(item.duration) && (item.duration ?? 0) > 0
	return hasValidDuration ? formatRecordingDuration(item.duration ?? 0) : "--:--"
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
	onRetry,
	isSubmitting = false,
}: MobileRecordingCardProps) {
	const { t } = useTranslation("audioRecordings")

	const title = resolveRecordingDisplayName(item.project_name, item.created_at)
	const createdSeconds = parseAudioProjectTimestamp(item.created_at)
	const timeLabel = createdSeconds != null ? relativeTimeFormatter(createdSeconds) : ""
	const durationDisplayLabel = resolveCardDurationLabel(item)
	const sourceLabel = resolveRecordingSourceLabel(item, {
		sourceRecorded: t("card.sourceRecorded"),
		sourceImported: t("card.sourceImported"),
		sourceDevice: t("card.sourceDevice"),
	})
	const SourceIcon = resolveSourceIcon(item)

	const isUploading = item.card_status === "uploading"
	const isUploadFailed = item.card_status === "upload_failed"
	const isSummarizing = item.card_status === "summarizing"
	const isSummarized = item.card_status === "summarized"
	const isSummaryFailed = item.card_status === "summary_failed"

	const showSummaryButton = item.card_status === "not_summarized" || isSummaryFailed

	const canClickSummary =
		(item.card_status === "not_summarized" || isSummaryFailed) && !isSubmitting

	function resolveSummaryLabel() {
		if (isSubmitting) return t("card.summarizing")
		if (isSummaryFailed) return t("card.retrySummary")
		return t("card.generateSummary")
	}

	const isProgressMode = isUploading || isUploadFailed

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

			{isProgressMode ? (
				<div className="flex flex-col gap-2">
					<ProgressMeta
						isTransferFailed={item.transferStatus === "failed"}
						pctText={Math.round((item.transferProgress ?? 0) * 100)}
					/>
					<LinearProgress
						value={item.transferProgress ?? 0}
						tone={item.transferStatus === "failed" ? "destructive" : "default"}
						indeterminate={
							item.transferStatus === "transferring" && item.transferProgress === 0
						}
					/>
				</div>
			) : (
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
						<span className="tabular-nums">{durationDisplayLabel}</span>
					</span>
				</div>
			)}

			<div className="mt-0.5 flex items-center gap-1.5">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
					{isSummarized ? (
						<ChipOutline icon={CheckCircle2}>{t("card.summarized")}</ChipOutline>
					) : null}
					<ChipMuted icon={SourceIcon}>{sourceLabel}</ChipMuted>
				</div>

				{!isProgressMode && showSummaryButton && !isSummarizing ? (
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

				{!isProgressMode && isSummarizing ? (
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

				{isProgressMode && item.transferStatus === "failed" ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation()
							onRetry?.(item)
						}}
						className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-3 text-[13px] font-medium leading-5 text-destructive transition-colors active:bg-destructive/20"
						data-testid={`mobile-recording-card-retry-${item.id}`}
					>
						<RefreshCw className="size-3.5" strokeWidth={2} />
						{t("card.retryUpload", { defaultValue: "重试" })}
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
