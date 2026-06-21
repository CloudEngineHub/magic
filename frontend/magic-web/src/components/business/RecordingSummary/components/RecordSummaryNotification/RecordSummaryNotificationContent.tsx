import type { RecordSummaryNotificationContentProps } from "./types"
import { RecordSummaryActionButton, RecordSummaryAlertCard } from "../RecordSummaryAlertCard"
import { Check, TriangleAlert } from "lucide-react"

function RecordSummaryNotificationContent({
	title,
	description,
	onViewClick,
	onDismiss,
	viewText,
	ignoreText,
	success = false,
}: RecordSummaryNotificationContentProps) {
	return (
		<RecordSummaryAlertCard
			title={title}
			description={description}
			icon={success ? <Check size={16} strokeWidth={2} /> : <TriangleAlert size={16} />}
			tone={success ? "success" : "danger"}
			className="w-full"
			data-testid="record-summary-notification-card"
			footer={
				<>
					<RecordSummaryActionButton
						appearance="secondary"
						onClick={onDismiss}
						data-testid="record-summary-notification-dismiss-button"
					>
						{ignoreText}
					</RecordSummaryActionButton>
					<RecordSummaryActionButton
						appearance="primary"
						onClick={onViewClick}
						data-testid="record-summary-notification-view-button"
					>
						{viewText}
					</RecordSummaryActionButton>
				</>
			}
		/>
	)
}

export default RecordSummaryNotificationContent
