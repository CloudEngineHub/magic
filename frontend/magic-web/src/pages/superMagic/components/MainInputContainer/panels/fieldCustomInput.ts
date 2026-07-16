import type { FieldCustomInputConfig } from "./types"

const STEP_TOLERANCE = 1e-9

/** Normalize and validate a custom field value before writing it to field.current_value. */
export function normalizeFieldCustomInputValue(
	value: string,
	config: FieldCustomInputConfig,
): string | null {
	const trimmedValue = value.trim()
	if (!trimmedValue) return null

	const numericValue = Number(trimmedValue)
	if (!Number.isFinite(numericValue)) return null
	if (config.integer && !Number.isSafeInteger(numericValue)) return null
	if (config.min !== undefined && numericValue < config.min) return null
	if (config.max !== undefined && numericValue > config.max) return null

	if (config.step !== undefined) {
		if (!Number.isFinite(config.step) || config.step <= 0) return null

		const baseValue = config.min ?? 0
		const stepRatio = (numericValue - baseValue) / config.step
		if (Math.abs(stepRatio - Math.round(stepRatio)) > STEP_TOLERANCE) return null
	}

	return String(numericValue)
}
