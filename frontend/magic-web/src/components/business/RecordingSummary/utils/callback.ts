import { GetRecordingSummaryResultResponse } from "@/apis/modules/superMagic/recordSummary"
import showWaitingTipModal from "../components/WaitingTipModal"
import showRecordErrorModal from "../components/RecordErrorModal"
import { history } from "@/routes/history"
import { RouteName } from "@/routes/constants"
import { isAudioProjectMode } from "@/services/audioRecordings"

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
			history.push({
				name: RouteName.AudioRecordingDetail,
				params: {
					projectId: res.project_id,
				},
				state: {
					projectName: res.project_name,
				},
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
