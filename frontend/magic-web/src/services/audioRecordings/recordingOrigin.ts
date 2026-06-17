import { RouteName } from "@/routes/constants"
import { history } from "@/routes/history"
import { genProjectTopicUrl } from "@/pages/superMagic/utils/project"
import { isAudioProjectMode } from "./audioProjectMode"

/**
 * Resolves the correct result-view href based on whether the project came from
 * the new mobile recordings entry or the legacy record-summary expert flow.
 */
export function resolveRecordSummaryResultHref(params: {
	projectId?: string | null
	workspaceId?: string | null
	topicId?: string | null
	projectMode?: string | null
}): string | undefined {
	if (isAudioProjectMode(params.projectMode)) {
		return history.createHref({
			name: RouteName.AudioRecordingDetail,
			params: { projectId: params.projectId || "" },
		})
	}

	return genProjectTopicUrl(params.workspaceId, params.projectId, params.topicId)
}
