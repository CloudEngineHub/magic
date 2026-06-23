export const MOBILE_SHARE_TOPBAR_OFFSET = "calc(52px + var(--safe-area-inset-top,0px))"

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
