import { DAY_KEY_FORMAT, DEFAULT_TIME_FORMAT } from "../constants/formats"
import type { Timezone } from "../core/types"
import { dayjs } from "../core/timezone-engine"
import { assertTimeInput, assertTimezoneCode } from "../core/validate"
import { getTimezones } from "../api/catalog"
import { convertTime, formatInTimezone } from "../api/convert"

/**
 * Checks whether two time values cross a day boundary in a given timezone.
 *
 * @param input - Comparison parameters.
 * @param input.start - Start time, supports string, unix seconds, and Date.
 * @param input.end - End time, supports string, unix seconds, and Date.
 * @param input.timezone - IANA timezone identifier, for example `Asia/Shanghai`.
 * @returns `true` when start and end are on different dates, otherwise `false`.
 */
export const isCrossDay = (input: {
	start: Timezone.TimeInput
	end: Timezone.TimeInput
	timezone: Timezone.TimezoneCode
}): boolean => {
	assertTimezoneCode(input.timezone)
	assertTimeInput(input.start, "start")
	assertTimeInput(input.end, "end")

	const startText = formatInTimezone(input.start, {
		timezone: input.timezone,
		format: DAY_KEY_FORMAT,
	})
	const endText = formatInTimezone(input.end, {
		timezone: input.timezone,
		format: DAY_KEY_FORMAT,
	})
	return startText !== endText
}

/**
 * Builds timezone select options and supports pinning preferred items first.
 *
 * @param options - Optional generation config.
 * @param options.locale - Display locale. Falls back to default locale when omitted.
 * @param options.preferred - Timezone codes that should appear first, in provided order.
 * @returns Standard select options with `label`, `value`, and `offset`.
 */
export const buildTimezoneSelectOptions = (
	options: {
		locale?: Timezone.Locale
		preferred?: Timezone.TimezoneCode[]
	} = {},
): Array<{ label: string; value: string; offset: string }> => {
	const list = getTimezones({ locale: options.locale })
	const preferred = options.preferred || []
	const optionMap = new Map(
		list.map((item) => [
			item.code,
			{
				label: `(GMT${item.offset}) ${item.label}`,
				value: item.code,
				offset: item.offset,
			},
		]),
	)

	const preferredList = preferred
		.map((code) => optionMap.get(code))
		.filter((item): item is { label: string; value: string; offset: string } => !!item)

	const preferredSet = new Set(preferred)
	const restList = list
		.filter((item) => !preferredSet.has(item.code))
		.map((item) => ({
			label: `(GMT${item.offset}) ${item.label}`,
			value: item.code,
			offset: item.offset,
		}))
	return [...preferredList, ...restList]
}

/**
 * Normalizes a meeting time for both organizer and viewer timezones.
 *
 * @param input - Meeting conversion parameters.
 * @param input.meetingTime - Original meeting time interpreted in organizer timezone.
 * @param input.organizerTimezone - Organizer timezone (source timezone).
 * @param input.viewerTimezone - Viewer timezone (target timezone).
 * @param input.format - Output format. Uses default format when omitted.
 * @returns Organizer text, viewer text, and whether viewer date changes.
 */
export const normalizeMeetingTime = (input: {
	meetingTime: Timezone.TimeInput
	organizerTimezone: Timezone.TimezoneCode
	viewerTimezone: Timezone.TimezoneCode
	format?: string
}): {
	organizerText: string
	viewerText: string
	viewerDateChanged: boolean
} => {
	const format = input.format || DEFAULT_TIME_FORMAT
	assertTimezoneCode(input.organizerTimezone, "organizerTimezone")
	assertTimezoneCode(input.viewerTimezone, "viewerTimezone")
	assertTimeInput(input.meetingTime, "meetingTime")

	const organizerText = formatInTimezone(input.meetingTime, {
		timezone: input.organizerTimezone,
		format,
	})

	const viewerText = convertTime(input.meetingTime, {
		from: input.organizerTimezone,
		to: input.viewerTimezone,
		format,
	})

	const organizerDay = dayjs.tz(organizerText, input.organizerTimezone).format(DAY_KEY_FORMAT)
	const viewerDay = dayjs.tz(viewerText, input.viewerTimezone).format(DAY_KEY_FORMAT)

	return {
		organizerText,
		viewerText,
		viewerDateChanged: organizerDay !== viewerDay,
	}
}
