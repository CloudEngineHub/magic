/** Shared desktop conversation input bounds used by every resize entry point. */
export const CONVERSATION_INPUT_HEIGHT_CONFIG = {
	/** Keep content-driven growth conservative by default. */
	maxRatio: 0.5,
	/** Allow an intentional drag to occupy more space than automatic growth. */
	manualMaxRatio: 0.7,
	/** Keep a readable message area while the input is manually expanded. */
	manualMinAvailableHeight: 240,
} as const
