export const METRIC_CONTROL_MAX_WIDTH = 220
const METRIC_INPUT_MIN_WIDTH = 48
const METRIC_INPUT_MAX_WIDTH = 164
const METRIC_STEPPER_WIDTH = 14

/** Keep short values compact while reserving enough room for longer CSS values. */
export function getMetricControlWidth(value: string): number {
	return Math.min(
		METRIC_CONTROL_MAX_WIDTH,
		getMetricInputWidth(value) + 56 + METRIC_STEPPER_WIDTH,
	)
}

export function getMetricInputWidth(value: string): number {
	return Math.min(
		METRIC_INPUT_MAX_WIDTH,
		Math.max(METRIC_INPUT_MIN_WIDTH, 28 + Math.max(value.length, 1) * 8),
	)
}
