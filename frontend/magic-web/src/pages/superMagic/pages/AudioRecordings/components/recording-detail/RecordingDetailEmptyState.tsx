import { FileAudio, FileText, Loader2, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
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
		return { title: t("detail.emptySummaryFile"), description: "" }
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
	if (variant === "summaryPending" || variant === "summaryFailed") {
		return <Sparkles className="size-5" />
	}
	return null
}

/** Dual-column skeleton shown while the detail data hook is loading. */
export function RecordingDetailPageSkeleton() {
	return (
		<div className="grid min-h-0 flex-1 grid-cols-[400px_minmax(0,1fr)] gap-6 px-8 pb-8">
			<div className="flex min-h-0 flex-col gap-4">
				<div className="h-36 animate-pulse rounded-2xl bg-muted" />
				<div className="min-h-0 flex-1 animate-pulse rounded-2xl bg-muted" />
			</div>
			<div className="min-h-0 animate-pulse rounded-[22px] border border-border bg-muted" />
		</div>
	)
}
