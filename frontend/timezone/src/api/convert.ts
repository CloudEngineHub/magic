import { DEFAULT_TIME_FORMAT } from "../constants/formats"
import { TimezoneError, TimezoneErrorCode } from "../constants/errors"
import { dayjs } from "../core/timezone-engine"
import type { Timezone } from "../core/types"
import { assertSupportedFormat, assertTimeInput, assertTimezoneCode } from "../core/validate"

/**
 * Parses a supported time input into a dayjs object.
 *
 * - Number input is treated as unix seconds.
 * - String/Date input is interpreted in `fromTimezone`.
 *
 * @param input - Time input value.
 * @param fromTimezone - Source timezone for non-number inputs.
 * @returns Parsed dayjs value.
 */
const parseFromInput = (
	input: Timezone.TimeInput,
	fromTimezone?: Timezone.TimezoneCode,
): ReturnType<typeof dayjs> => {
	assertTimeInput(input)

	if (typeof input === "number") {
		return dayjs.unix(input)
	}

	if (!fromTimezone) {
		throw new TimezoneError(
			TimezoneErrorCode.UNSUPPORTED_OPERATION,
			"`from` timezone is required for string/date input",
		)
	}
	assertTimezoneCode(fromTimezone, "from")
	return dayjs(input).tz(fromTimezone, true)
}

/**
 * Ensures a dayjs value is valid.
 *
 * @param value - Dayjs value to validate.
 * @param field - Field name for error message context.
 */
const ensureValidDayjs = (value: ReturnType<typeof dayjs>, field = "input"): void => {
	if (!value.isValid()) {
		throw new TimezoneError(TimezoneErrorCode.INVALID_TIME_INPUT, `${field} is invalid`)
	}
}

/**
 * Returns current time formatted in a target timezone.
 *
 * @param options - Formatting options.
 * @param options.timezone - Target timezone, defaults to system guess.
 * @param options.format - Output format, defaults to library default format.
 * @returns Formatted current time text.
 */
export const now = (
	options: { timezone?: Timezone.TimezoneCode; format?: string } = {},
): string => {
	const timezone = options.timezone || dayjs.tz.guess()
	const format = options.format || DEFAULT_TIME_FORMAT
	assertTimezoneCode(timezone)
	assertSupportedFormat(format)
	return dayjs().tz(timezone).format(format)
}

/**
 * Converts an input time to another timezone and returns formatted text.
 *
 * @param input - Time input.
 * @param options - Conversion options.
 * @param options.from - Source timezone for string/date input.
 * @param options.to - Target timezone.
 * @param options.format - Output format, defaults to library default format.
 * @returns Converted time text in target timezone.
 */
export const convertTime = (
	input: Timezone.TimeInput,
	options: {
		from?: Timezone.TimezoneCode
		to: Timezone.TimezoneCode
		format?: string
	},
): string => {
	const format = options.format || DEFAULT_TIME_FORMAT
	assertTimezoneCode(options.to, "to")
	assertSupportedFormat(format)
	const parsed = parseFromInput(input, options.from)
	ensureValidDayjs(parsed)
	return parsed.tz(options.to).format(format)
}

/**
 * Converts a time input into unix timestamp seconds or milliseconds.
 *
 * @param input - Time input.
 * @param options - Conversion options.
 * @param options.timezone - Timezone used to interpret string/date input.
 * @param options.unit - Timestamp unit, `s` or `ms` (default: `s`).
 * @returns Numeric timestamp in requested unit.
 */
export const toTimestamp = (
	input: Timezone.TimeInput,
	options: { timezone?: Timezone.TimezoneCode; unit?: "s" | "ms" } = {},
): number => {
	const unit = options.unit || "s"
	if (unit !== "s" && unit !== "ms") {
		throw new TimezoneError(
			TimezoneErrorCode.UNSUPPORTED_OPERATION,
			`unsupported unit: ${unit}`,
		)
	}

	assertTimeInput(input)
	if (typeof input === "number") {
		if (unit === "s") return input
		return Math.floor(input * 1000)
	}

	const timezone = options.timezone || dayjs.tz.guess()
	assertTimezoneCode(timezone)
	const parsed = dayjs(input).tz(timezone, true)
	ensureValidDayjs(parsed)
	return unit === "s" ? parsed.unix() : parsed.valueOf()
}

/**
 * Formats a time input in a specified timezone.
 *
 * @param input - Time input.
 * @param options - Formatting options.
 * @param options.timezone - Target timezone.
 * @param options.format - Output format.
 * @returns Formatted time text in target timezone.
 */
export const formatInTimezone = (
	input: Timezone.TimeInput,
	options: { timezone: Timezone.TimezoneCode; format: string },
): string => {
	assertTimezoneCode(options.timezone)
	assertSupportedFormat(options.format)
	assertTimeInput(input)

	const parsed = typeof input === "number" ? dayjs.unix(input) : dayjs(input)
	ensureValidDayjs(parsed)
	return parsed.tz(options.timezone).format(options.format)
}
