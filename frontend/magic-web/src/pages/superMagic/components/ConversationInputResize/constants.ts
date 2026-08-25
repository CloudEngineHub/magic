/** Shared desktop conversation bounds used by every resize entry point. */
/**
 * Keep specialized composer controls inside the smallest supported panel.
 * Add a mode-specific constant below when a new composer contains extra or specialized UI;
 * do not raise this shared value unless every consumer has the same layout contract.
 */
export const SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT = 260
/** Reserve enough vertical space for the PPT editor and its template controls. */
export const PPT_COMPOSER_MIN_INPUT_HEIGHT = 320

/**
 * Resolve the minimum height from explicit mode capabilities instead of a generic mode fallback.
 * Modes with extra controls must add a boolean here and a regression case so their minimum height
 * is reviewed deliberately rather than silently inheriting an unsafe default.
 */
export function resolveComposerMinInputHeight({
	isPptMode,
	isSelfMediaMode,
	isRecordSummaryMode,
}: {
	isPptMode: boolean
	isSelfMediaMode: boolean
	isRecordSummaryMode: boolean
}) {
	// PPT has the most vertically demanding controls and must win if multiple flags are true.
	if (isPptMode) return PPT_COMPOSER_MIN_INPUT_HEIGHT
	// Keep existing specialized modes stable until their own layout requirements are reevaluated.
	if (isSelfMediaMode || isRecordSummaryMode) return SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT
	return undefined
}

export const CONVERSATION_INPUT_HEIGHT_CONFIG = {
	/** Keep content-driven growth conservative by default. */
	maxRatio: 0.5,
	/** Allow an intentional drag to occupy more space than automatic growth. */
	manualMaxRatio: 0.7,
	/** Keep a readable message area while the input is manually expanded. */
	manualMinAvailableHeight: 240,
} as const
