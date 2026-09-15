import { DEFAULT_TIME_FORMAT } from "../constants/formats"
import { dayjs } from "../core/timezone-engine"
import type { Timezone } from "../core/types"
import { assertSupportedFormat, assertTimeInput, assertTimezoneCode } from "../core/validate"

/**
 * Resolves a base date in a target timezone.
 *
 * @param date - Optional date input, defaults to current time.
 * @param timezone - Target timezone.
 * @returns Dayjs value aligned to the target timezone.
 */
const getBaseDate = (date: Timezone.TimeInput | undefined, timezone: Timezone.TimezoneCode) => {
	if (date === undefined) return dayjs().tz(timezone)
	assertTimeInput(date, "date")
	if (typeof date === "number") return dayjs.unix(date).tz(timezone)
	return dayjs(date).tz(timezone, true)
}

/**
 * Returns the start and end of day in a given timezone.
 *
 * @param options - Range options.
 * @param options.date - Base date input, defaults to now.
 * @param options.timezone - Target timezone.
 * @param options.format - Output format, defaults to library default format.
 * @returns Tuple of `[dayStart, dayEnd]`.
 */
export const getDayRange = (options: {
	date?: Timezone.TimeInput
	timezone: Timezone.TimezoneCode
	format?: string
}): [string, string] => {
	assertTimezoneCode(options.timezone)
	const format = options.format || DEFAULT_TIME_FORMAT
	assertSupportedFormat(format)
	const baseDate = getBaseDate(options.date, options.timezone)
	return [baseDate.startOf("day").format(format), baseDate.endOf("day").format(format)]
}

/**
 * Returns the start and end of month in a given timezone.
 *
 * @param options - Range options.
 * @param options.date - Base date input, defaults to now.
 * @param options.timezone - Target timezone.
 * @param options.format - Output format, defaults to library default format.
 * @returns Tuple of `[monthStart, monthEnd]`.
 */
export const getMonthRange = (options: {
	date?: Timezone.TimeInput
	timezone: Timezone.TimezoneCode
	format?: string
}): [string, string] => {
	assertTimezoneCode(options.timezone)
	const format = options.format || DEFAULT_TIME_FORMAT
	assertSupportedFormat(format)
	const baseDate = getBaseDate(options.date, options.timezone)
	return [baseDate.startOf("month").format(format), baseDate.endOf("month").format(format)]
}
