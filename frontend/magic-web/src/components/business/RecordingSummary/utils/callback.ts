import { GetRecordingSummaryResultResponse } from "@/apis/modules/superMagic/recordSummary"
import showWaitingTipModal from "../components/WaitingTipModal"
import showRecordErrorModal from "../components/RecordErrorModal"
import { isAudioProjectMode } from "@/services/audioRecordings"
import recordSummaryStore from "@/stores/recordingSummary"
import { requestAudioRecordingsShellRefresh } from "@/pages/superMagic/pages/AudioRecordings/utils/request-audio-recordings-shell-refresh"

/** Resolves project mode from API payload with store fallback for audio-recordings sessions. */
function resolveRecordingSummaryProjectMode(
	res: GetRecordingSummaryResultResponse & { project_mode?: string | null },
): string | null | undefined {
	return (
		res.project_mode ??
		(recordSummaryStore.businessData.project as { project_mode?: string | null } | null)
			?.project_mode
	)
}

export function onSummarizeSuccessDefaultCallback(
	res: GetRecordingSummaryResultResponse & {
		model_id: string
		workspace_id: string
		project_name: string
		project_mode?: string | null
	},
) {
	if (res.success) {
		const projectMode = resolveRecordingSummaryProjectMode(res)

		if (isAudioProjectMode(projectMode)) {
			requestAudioRecordingsShellRefresh()
			showWaitingTipModal({
				presentation: "audioRecordings",
			})
			return
		}

		showWaitingTipModal({
			projectName: res.project_name,
			workspaceName: res.workspace_name,
			presentation: "default",
		})
	} else {
		showRecordErrorModal({ response: res })
	}
}
