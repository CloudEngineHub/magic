import { FileAudio, FileText, Loader2, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { cn } from "@/lib/utils"

export type RecordingDetailEmptyVariant =
	| "pageLoading"
	| "pageError"
	| "projectMissing"
	| "noAudio"
	| "noTranscript"
	| "noNotes"
	| "noSummary"
	| "noSummaryFile"
	| "summaryPending"
	| "summaryGenerating"
	| "summaryFailed"
	| "shareNoTranscript"
	| "shareNoReadable"

interface RecordingDetailEmptyStateProps {
	variant: RecordingDetailEmptyVariant
	className?: string
	onAction?: () => void
	actionLabel?: string
	compact?: boolean
}

/** Unified empty/placeholder states for owner and future share recording detail workbench regions. */
export function RecordingDetailEmptyState({
	variant,
	className,
	onAction,
	actionLabel,
	compact = false,
}: RecordingDetailEmptyStateProps) {
	const { t } = useTranslation("audioRecordings")
	const copy = resolveEmptyCopy(variant, t)

	if (variant === "pageLoading") {
		return (
			<div className={cn("flex h-full items-center justify-center", className)} role="status">
				<Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">{t("detail.loading")}</span>
			</div>
		)
	}

	const icon = resolveEmptyIcon(variant)

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center",
				compact ? "gap-2 px-4 py-8" : "gap-3 px-8 py-16",
				className,
			)}
			data-testid={`recording-detail-empty-${variant}`}
		>
			{icon ? (
				<div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
					{icon}
				</div>
			) : null}
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">{copy.title}</p>
				{copy.description ? (
					<p className="text-sm text-muted-foreground">{copy.description}</p>
				) : null}
			</div>
			{onAction && actionLabel ? (
				<Button size="sm" onClick={onAction}>
					{actionLabel}
				</Button>
			) : null}
		</div>
	)
}

/** Maps each empty variant to localized title and description copy. */
function resolveEmptyCopy(
	variant: RecordingDetailEmptyVariant,
	t: ReturnType<typeof useTranslation>["t"],
) {
	if (variant === "pageError") {
		return { title: t("detail.loadFailed"), description: "" }
	}
	if (variant === "projectMissing") {
		return { title: t("detail.entryNotFound"), description: "" }
	}
	if (variant === "noAudio") {
		return { title: t("detail.empty.noAudio"), description: t("detail.empty.noAudioHint") }
	}
	if (variant === "noTranscript") {
		return {
			title: t("detail.emptyTranscript"),
			description: t("detail.empty.noTranscriptHint"),
		}
	}
	if (variant === "noNotes") {
		return { title: t("detail.emptyNotes"), description: "" }
	}
	if (variant === "noSummary") {
		return { title: t("detail.emptySummary"), description: "" }
	}
	if (variant === "noSummaryFile") {
		return { title: t("detail.emptySummary"), description: "" }
	}
	if (variant === "summaryPending") {
		return { title: t("detail.notSummarized"), description: t("detail.notSummarizedHint") }
	}
	if (variant === "summaryGenerating") {
		return { title: t("detail.summarizing"), description: t("detail.summarizingHint") }
	}
	if (variant === "summaryFailed") {
		return {
			title: t("detail.empty.summaryFailed"),
			description: t("detail.empty.summaryFailedHint"),
		}
	}
	if (variant === "shareNoTranscript") {
		return { title: t("detail.empty.shareNoTranscript"), description: "" }
	}
	if (variant === "shareNoReadable") {
		return { title: t("detail.empty.shareNoReadable"), description: "" }
	}
	return { title: "", description: "" }
}

/** Picks a lightweight icon per empty variant for visual scanning. */
function resolveEmptyIcon(variant: RecordingDetailEmptyVariant) {
	if (variant === "noAudio") return <FileAudio className="size-5" />
	if (variant === "noTranscript" || variant === "noNotes" || variant === "shareNoTranscript") {
		return <FileText className="size-5" />
	}
	if (variant === "summaryGenerating") {
		return <Loader2 className="size-5 animate-spin" />
	}
	if (
		variant === "noSummary" ||
		variant === "noSummaryFile" ||
		variant === "summaryPending" ||
		variant === "summaryFailed"
	) {
		return <Sparkles className="size-5" />
	}
	return null
}

/** Waveform bar heights mirroring the collapsed audio bar seek strip. */
const PLAYER_WAVEFORM_BAR_HEIGHTS = [
	6, 10, 8, 12, 7, 11, 9, 13, 8, 10, 6, 12, 9, 11, 7, 10, 8, 13, 9, 11,
]

/** Transcript segment placeholders with meta row plus multi-line body. */
const TRANSCRIPT_SEGMENT_SKELETONS = [
	{ bodyLines: ["w-full", "w-[92%]"] },
	{ bodyLines: ["w-[88%]", "w-[76%]", "w-[64%]"] },
	{ bodyLines: ["w-full", "w-[84%]"] },
	{ bodyLines: ["w-[72%]"] },
] as const

/** Skeleton placeholder aligned with the collapsed RecordingDetailAudioBar layout. */
function RecordingDetailPlayerSkeleton() {
	return (
		<div
			className="shrink-0 rounded-2xl border border-border bg-card"
			data-testid="recording-detail-player-skeleton"
		>
			<div className="flex items-center gap-1.5 px-3 py-1.5">
				<Skeleton className="size-7 shrink-0 rounded-full" />
				<Skeleton className="h-3 w-16 shrink-0 rounded-sm" />
				<div className="flex min-w-0 flex-1 items-center gap-px">
					{PLAYER_WAVEFORM_BAR_HEIGHTS.map((height, index) => (
						<Skeleton
							key={index}
							className="w-0.5 shrink-0 rounded-full"
							style={{ height }}
						/>
					))}
				</div>
				<Skeleton className="size-7 shrink-0 rounded-full" />
			</div>
		</div>
	)
}

/** Skeleton placeholder aligned with RecordingDetailTranscriptPanel header and segments. */
function RecordingDetailTranscriptSkeleton() {
	return (
		<div
			className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card"
			data-testid="recording-detail-transcript-skeleton"
		>
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<Skeleton className="h-4 w-24 rounded-sm" />
				<Skeleton className="h-8 w-20 rounded-md" />
			</div>
			<div className="flex min-h-[320px] flex-1 flex-col gap-3 px-4 py-3">
				{TRANSCRIPT_SEGMENT_SKELETONS.map((segment, index) => (
					<div key={index} className="rounded-xl px-3 py-2.5">
						<div className="mb-1 flex items-center gap-2">
							<Skeleton className="h-3 w-8 shrink-0 rounded-sm" />
							<Skeleton className="h-5 w-16 rounded-full" />
						</div>
						<div className="space-y-1.5">
							{segment.bodyLines.map((lineWidth, lineIndex) => (
								<Skeleton
									key={lineIndex}
									className={cn("h-4 rounded-sm", lineWidth)}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

/** Skeleton placeholder for the right panel tab strip and summary content. */
function RecordingDetailRightPanelSkeleton() {
	return (
		<div className="flex min-h-0 flex-col gap-4 rounded-[22px] border border-border bg-card p-5">
			<div className="flex items-center gap-2">
				<Skeleton className="h-8 w-16 rounded-full" />
				<Skeleton className="h-8 w-20 rounded-full" />
				<Skeleton className="h-8 w-24 rounded-full" />
				<Skeleton className="h-8 w-14 rounded-full" />
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				<Skeleton className="h-5 w-40 rounded-md" />
				<Skeleton className="h-4 w-full rounded-sm" />
				<Skeleton className="h-4 w-[92%] rounded-sm" />
				<Skeleton className="h-4 w-[78%] rounded-sm" />
				<Skeleton className="h-4 w-[86%] rounded-sm" />
				<Skeleton className="h-4 w-[60%] rounded-sm" />
			</div>
		</div>
	)
}

/** Dual-column skeleton with shimmer and fade-in while the detail data hook is loading. */
export function RecordingDetailPageSkeleton() {
	return (
		<div
			className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] gap-6 px-8 pb-8 duration-300 animate-in fade-in"
			role="status"
			aria-busy="true"
			data-testid="recording-detail-page-skeleton"
		>
			<div className="flex min-h-0 flex-col gap-4">
				<RecordingDetailPlayerSkeleton />
				<RecordingDetailTranscriptSkeleton />
			</div>
			<RecordingDetailRightPanelSkeleton />
		</div>
	)
}
