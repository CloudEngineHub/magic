export const MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM = "64px"

/** Lifts the share brand badge above the mobile audio player only for the readonly audio share shell. */
export function resolveMobileAudioShareCreatedByBadgeBottom(params: {
	defaultBottom: string
	isMobile: boolean
	shouldRenderAudioShareShell: boolean
}): string {
	const { defaultBottom, isMobile, shouldRenderAudioShareShell } = params

	if (!shouldRenderAudioShareShell || !isMobile) {
		return defaultBottom
	}

	return MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM
}
