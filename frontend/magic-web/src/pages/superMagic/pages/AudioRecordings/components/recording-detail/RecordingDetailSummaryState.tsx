import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"

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

	if (status === "generating") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3">
				<RecordingDetailEmptyState variant="summaryGenerating" />
			</div>
		)
	}

	if (status === "failed") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3">
				<RecordingDetailEmptyState
					variant="summaryFailed"
					onAction={onGenerateSummary}
					actionLabel={t("card.retrySummary")}
				/>
			</div>
		)
	}

	return (
		<div className="flex h-full flex-col items-center justify-center gap-3">
			<RecordingDetailEmptyState variant="summaryPending" />
			{onGenerateSummary ? (
				<Button onClick={onGenerateSummary} disabled={generating}>
					{generating ? t("detail.summarizing") : t("card.generateSummary")}
				</Button>
			) : null}
		</div>
	)
}
