import type { RecordSummaryNotificationContentProps } from "./types"
import { RecordSummaryActionButton, RecordSummaryAlertCard } from "../RecordSummaryAlertCard"
import { Check, TriangleAlert } from "lucide-react"
import { isAudioProjectMode } from "@/services/audioRecordings"
import { RouteName } from "@/routes/constants"
import { history } from "@/routes/history"
import { genProjectTopicUrl } from "@/pages/superMagic/utils/project"

function RecordSummaryNotificationContent({
	title,
	description,
	onViewClick,
	onDismiss,
	viewText,
	ignoreText,
	success = false,
	workspaceId,
	projectId,
	projectMode,
	topicId,
}: RecordSummaryNotificationContentProps) {
	const resultHref = isAudioProjectMode(projectMode)
		? history.createHref({
				name: RouteName.AudioRecordingDetail,
				params: { projectId: projectId || "" },
			})
		: genProjectTopicUrl(workspaceId, projectId, topicId)

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
						asChild
						appearance="primary"
						data-testid="record-summary-notification-view-button"
					>
						<a
							href={resultHref}
							target="_blank"
							rel="noreferrer"
							className="hover:text-primary-foreground"
							onClick={onViewClick}
						>
							{viewText}
						</a>
					</RecordSummaryActionButton>
				</>
			}
		/>
	)
}

export default RecordSummaryNotificationContent
