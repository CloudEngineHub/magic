export const MOBILE_SHARE_TOPBAR_OFFSET = "calc(52px + var(--safe-area-inset-top,0px))"
export const MOBILE_AUDIO_SHARE_CREATED_BY_BADGE_BOTTOM = "64px"

/** Resolves the extra top offset only for mobile audio share shells that still render the shared topbar. */
export function resolveMobileAudioShareTopbarOffset(params: {
	isMobile: boolean
	shouldHideHeader: boolean
	shouldRenderAudioShareShell: boolean
}): string | undefined {
	const { isMobile, shouldHideHeader, shouldRenderAudioShareShell } = params

	if (!shouldRenderAudioShareShell || !isMobile || shouldHideHeader) {
		return undefined
	}

	return MOBILE_SHARE_TOPBAR_OFFSET
}

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
