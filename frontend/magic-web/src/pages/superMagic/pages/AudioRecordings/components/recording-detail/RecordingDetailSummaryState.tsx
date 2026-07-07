import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"

// TODO(audio-recordings): Flip on after backend exposes a stable re-summary API.
const ENABLE_REGENERATE_SUMMARY_ACTION = false

interface RecordingDetailSummaryStateProps {
	status: "pending" | "generating" | "failed"
	onGenerateSummary?: () => void
	generating?: boolean
}

/** Right-panel placeholder for not summarized / summarizing / failed summary states. */
export function RecordingDetailSummaryState({
	status,
	onGenerateSummary,
	generating = false,
}: RecordingDetailSummaryStateProps) {
	const { t } = useTranslation("audioRecordings")
	const failedSummaryAction = ENABLE_REGENERATE_SUMMARY_ACTION ? onGenerateSummary : undefined

	if (status === "generating") {
		return (
			<div
				className="flex h-full flex-col items-center justify-center"
				data-testid="recording-detail-summary-state-generating"
			>
				<RecordingDetailEmptyState variant="summaryGenerating" />
			</div>
		)
	}

	if (status === "failed") {
		return (
			<div
				className="flex h-full flex-col items-center justify-center"
				data-testid="recording-detail-summary-state-failed"
			>
				{/* TODO(audio-recordings): Re-enable regenerate action when the backend re-summary API is available. */}
				<RecordingDetailEmptyState
					variant="summaryFailed"
					onAction={failedSummaryAction}
					actionLabel={failedSummaryAction ? t("card.regenerateSummary") : undefined}
				/>
			</div>
		)
	}

	return (
		<div
			className="flex h-full flex-col items-center justify-center gap-5"
			data-testid="recording-detail-summary-state-pending"
		>
			<RecordingDetailEmptyState variant="summaryPending" className="pb-0" />
			{onGenerateSummary ? (
				<Button
					onClick={onGenerateSummary}
					disabled={generating}
					className="h-10 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background hover:bg-foreground/90"
				>
					{generating ? t("detail.summarizing") : t("card.generateSummary")}
				</Button>
			) : null}
		</div>
	)
}
