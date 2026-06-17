interface FloatPanelVisibilityPolicyInput {
	isVisible: boolean
	isOnMobileRecordingsListRoute: boolean
	isOnMobileRecordingDetailRoute: boolean
}

/**
 * FloatPanel visibility policy is centralized so route checks stay deterministic
 * as we gradually migrate legacy/new recording UI.
 *
 * Design intent:
 * - Recordings list route: always hide legacy panel — the list page owns its own
 *   active-recording card and floating indicator, regardless of session type.
 * - Recordings detail route: always hide legacy panel.
 * - Any other route: show legacy panel so users can recover an active session
 *   even after navigating away from the recordings section.
 */
export function shouldHideRecordingFloatPanel({
	isVisible,
	isOnMobileRecordingsListRoute,
	isOnMobileRecordingDetailRoute,
}: FloatPanelVisibilityPolicyInput): boolean {
	if (!isVisible) return true

	// The recordings list and detail pages manage their own session UI;
	// the legacy panel must not overlap them.
	if (isOnMobileRecordingsListRoute || isOnMobileRecordingDetailRoute) return true

	return false
}
