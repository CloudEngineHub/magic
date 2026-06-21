import { GetRecordingSummaryResultResponse } from "@/apis/modules/superMagic/recordSummary"
import showWaitingTipModal from "../components/WaitingTipModal"
import showRecordErrorModal from "../components/RecordErrorModal"
import { isAudioProjectMode, navigateToRecordSummaryResult } from "@/services/audioRecordings"

export function onSummarizeSuccessDefaultCallback(
	res: GetRecordingSummaryResultResponse & {
		model_id: string
		workspace_id: string
		project_name: string
		project_mode?: string | null
	},
) {
	if (res.success) {
		if (isAudioProjectMode(res.project_mode)) {
			navigateToRecordSummaryResult({
				projectId: res.project_id,
				projectMode: res.project_mode,
				projectName: res.project_name,
				openInNewTab: false,
			})
			return
		}

		showWaitingTipModal({
			projectName: res.project_name,
			workspaceName: res.workspace_name,
		})
	} else {
		showRecordErrorModal({ response: res })
	}
}
