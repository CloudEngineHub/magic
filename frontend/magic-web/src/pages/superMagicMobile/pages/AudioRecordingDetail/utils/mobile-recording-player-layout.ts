/** Keeps the player above the browser safe area while preserving a Web fallback gap. */
export const MOBILE_RECORDING_PLAYER_BOTTOM =
	"max(24px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))"

/** Builds the scroll padding needed to keep content clear of the floating player. */
export function getMobileRecordingPlayerScrollPadding(
	playerHeight: number,
	extraBottomGap = 0,
): string {
	return `calc(${MOBILE_RECORDING_PLAYER_BOTTOM} + ${playerHeight}px + ${extraBottomGap}px)`
}
