/** Shared desktop conversation bounds used by every resize entry point. */
/**
 * Keep standard composer controls inside the smallest supported panel.
 * Add a mode-specific constant below when a new composer contains extra or specialized UI;
 * do not raise this shared value unless every consumer has the same layout contract.
 */
/** Minimum height for the ordinary composer. */
export const DEFAULT_COMPOSER_MIN_INPUT_HEIGHT = 220
/** Keep specialized composer controls readable at their larger fixed height. */
export const SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT = 260
/** Reserve enough space for video production controls. */
export const VIDEO_PRODUCTION_COMPOSER_MIN_INPUT_HEIGHT = 274
/** Reserve enough vertical space for the PPT editor and its template controls. */
export const PPT_COMPOSER_MIN_INPUT_HEIGHT = 274

/** Resolve the shared minimum height while keeping PPT's larger control set explicit. */
export function resolveComposerMinInputHeight({
	isPptMode,
	isVideoProductionMode,
	isSpecializedMode,
}: {
	isPptMode: boolean
	isVideoProductionMode: boolean
	isSpecializedMode: boolean
}) {
	// PPT has the most vertically demanding controls and must win if multiple flags are true.
	if (isPptMode) return PPT_COMPOSER_MIN_INPUT_HEIGHT
	// Video production needs additional room for its configuration controls.
	if (isVideoProductionMode) return VIDEO_PRODUCTION_COMPOSER_MIN_INPUT_HEIGHT
	// Keep existing specialized controls above the ordinary composer floor.
	if (isSpecializedMode) return SPECIALIZED_COMPOSER_MIN_INPUT_HEIGHT
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
