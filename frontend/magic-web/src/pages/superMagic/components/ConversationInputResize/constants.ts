/** Shared desktop conversation bounds used by every resize entry point. */
/**
 * Keep standard composer controls inside the smallest supported panel.
 * Add a mode-specific constant below when a new composer contains extra or specialized UI;
 * do not raise this shared value unless every consumer has the same layout contract.
 */
export const DEFAULT_COMPOSER_MIN_INPUT_HEIGHT = 260
/** Keep the legacy name available for specialized composer consumers. */
export const SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT = DEFAULT_COMPOSER_MIN_INPUT_HEIGHT
/** Reserve enough vertical space for the PPT editor and its template controls. */
export const PPT_COMPOSER_MIN_INPUT_HEIGHT = 320

/** Resolve the shared minimum height while keeping PPT's larger control set explicit. */
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
	// All non-PPT composers share the same floor so scene presets cannot overlap the editor.
	if (isSelfMediaMode || isRecordSummaryMode) return SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT
	return DEFAULT_COMPOSER_MIN_INPUT_HEIGHT
}

export const CONVERSATION_INPUT_HEIGHT_CONFIG = {
	/** Keep content-driven growth conservative by default. */
	maxRatio: 0.5,
	/** Allow an intentional drag to occupy more space than automatic growth. */
	manualMaxRatio: 0.7,
	/** Keep a readable message area while the input is manually expanded. */
	manualMinAvailableHeight: 240,
} as const
