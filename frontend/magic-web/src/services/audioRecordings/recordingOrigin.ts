import { matchPath } from "react-router"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { history } from "@/routes/history"
import { genProjectTopicUrl, openInNewTab } from "@/pages/superMagic/utils/project"
import { getNativePort } from "@/platform/native"
import { isMagicApp } from "@/utils/devices"
import { isAudioProjectMode } from "./audioProjectMode"

export interface RecordSummaryResultNavigationParams {
	projectId?: string | null
	workspaceId?: string | null
	topicId?: string | null
	projectMode?: string | null
	projectName?: string | null
	/** Legacy expert flow defaults to opening a new tab; audio projects navigate in-place. */
	openInNewTab?: boolean
}

export interface RecordSummaryNotificationSuppressParams {
	projectId: string
	workspaceId: string
	topicId: string
	projectMode?: string | null
	pathname?: string
	workspaceState?: {
		topicId?: string | null
		workspaceId?: string | null
		projectId?: string | null
	} | null
}

/**
 * Resolves the correct result-view href based on whether the project came from
 * the new mobile recordings entry or the legacy record-summary expert flow.
 */
export function resolveRecordSummaryResultHref(
	params: RecordSummaryResultNavigationParams,
): string | undefined {
	if (isAudioProjectMode(params.projectMode)) {
		return history.createHref({
			name: RouteName.AudioRecordingDetail,
			params: { projectId: params.projectId || "" },
		})
	}

	return genProjectTopicUrl(params.workspaceId, params.projectId, params.topicId)
}

/**
 * Navigates to the post-summary destination for either the new recordings entry
 * or the legacy expert-mode topic page.
 */
export function navigateToRecordSummaryResult(params: RecordSummaryResultNavigationParams): void {
	if (isAudioProjectMode(params.projectMode)) {
		if (isMagicApp) {
			// Magic App owns the native recording experience, so web notifications hand off to the app tab.
			void getNativePort().navigation.changeBottomTab({
				tab: "ai_recording",
				bottomTabHeight: 0,
			})
			return
		}

		if (!params.projectId) return

		history.push({
			name: RouteName.AudioRecordingDetail,
			params: {
				projectId: params.projectId,
			},
			state: {
				projectName: params.projectName ?? undefined,
			},
		})
		return
	}

	const legacyHref = genProjectTopicUrl(params.workspaceId, params.projectId, params.topicId)
	if (!legacyHref) return

	if (params.openInNewTab !== false) {
		openInNewTab(legacyHref)
		return
	}

	if (!params.projectId || !params.topicId) return

	history.push({
		name: RouteName.SuperWorkspaceProjectTopicState,
		params: {
			projectId: params.projectId,
			topicId: params.topicId,
		},
	})
}

/**
 * Returns true when the user is already viewing the summary result destination,
 * so a global completion notification should not be shown again.
 */
export function shouldSuppressRecordSummaryNotification(
	params: RecordSummaryNotificationSuppressParams,
): boolean {
	const pathname = params.pathname ?? window.location.pathname

	if (isAudioProjectMode(params.projectMode)) {
		const detailMatch = matchPath(`/:clusterCode${RoutePath.AudioRecordingDetail}`, pathname)
		return detailMatch?.params.projectId === params.projectId
	}

	const workspaceState = params.workspaceState
	if (!workspaceState) return false

	return (
		workspaceState.topicId === params.topicId &&
		workspaceState.workspaceId === params.workspaceId &&
		workspaceState.projectId === params.projectId
	)
}
