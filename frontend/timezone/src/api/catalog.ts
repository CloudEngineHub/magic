import { timezoneCatalog } from "../data/timezone-catalog"
import type { Timezone } from "../core/types"
import { resolveLocaleLabel } from "../i18n"

/**
 * Builds a normalized timezone item from catalog data.
 *
 * @param base - Raw catalog entry.
 * @param locale - Locale used for label resolution.
 * @param groupByOffset - Whether to include offset as group key.
 * @returns A normalized timezone item.
 */
const buildItem = (
	base: (typeof timezoneCatalog)[number],
	locale?: Timezone.Locale,
	groupByOffset?: boolean,
): Timezone.TimezoneItem => ({
	code: base.code,
	offset: base.offset,
	offsetMinutes: base.offsetMinutes,
	label: resolveLocaleLabel(base.code, locale),
	city: base.city,
	group: groupByOffset ? base.offset : undefined,
})

/**
 * Lists timezones with optional locale, keyword filtering, and grouping.
 *
 * @param options - Query options for timezone list.
 * @param options.locale - Locale used to render labels.
 * @param options.keyword - Case-insensitive keyword for code/label/offset filtering.
 * @param options.groupByOffset - Whether to include group field by offset.
 * @returns The timezone list after transformation and filtering.
 */
export const getTimezones = (
	options: Timezone.ListTimezonesOptions = {},
): Timezone.TimezoneItem[] => {
	const keyword = options.keyword?.trim().toLowerCase()
	const items = timezoneCatalog.map((base) =>
		buildItem(base, options.locale, options.groupByOffset),
	)
	if (!keyword) return items

	return items.filter(
		(item) =>
			item.code.toLowerCase().includes(keyword) ||
			item.label.toLowerCase().includes(keyword) ||
			item.offset.includes(keyword),
	)
}

/**
 * Gets a single timezone item by IANA code.
 *
 * @param code - IANA timezone code such as `Asia/Shanghai`.
 * @param locale - Locale used to resolve label text.
 * @returns The timezone item if found, otherwise `undefined`.
 */
export const getTimezone = (
	code: Timezone.TimezoneCode,
	locale?: Timezone.Locale,
): Timezone.TimezoneItem | undefined => {
	const found = timezoneCatalog.find((item) => item.code === code)
	if (!found) return undefined
	return buildItem(found, locale)
}
