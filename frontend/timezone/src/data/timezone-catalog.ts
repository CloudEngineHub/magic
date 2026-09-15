import type { Timezone } from "../core/types"
import en_US from "../i18n/locales/en_US"

const OFFSET_REGEXP = /\(GMT\s*([+-])\s*(\d{1,2}):(\d{2})\)/

const formatOffset = (minutes: number): string => {
	const sign = minutes >= 0 ? "+" : "-"
	const absolute = Math.abs(minutes)
	const hours = String(Math.floor(absolute / 60)).padStart(2, "0")
	const mins = String(absolute % 60).padStart(2, "0")
	return `${sign}${hours}:${mins}`
}

const parseOffsetMinutes = (value: string): number => {
	const match = value.match(OFFSET_REGEXP)
	if (!match) return 0
	const sign = match[1] === "-" ? -1 : 1
	const hour = Number(match[2])
	const minute = Number(match[3])
	return sign * (hour * 60 + minute)
}

const parseCityFromLabel = (value: string): string | undefined => {
	const closeBracket = value.indexOf(")")
	if (closeBracket === -1) return undefined
	const cityPart = value.slice(closeBracket + 1).trim()
	if (!cityPart) return undefined
	return cityPart.split(",")[0]?.trim() || undefined
}

const timezoneCodes = Object.keys(en_US) as Timezone.TimezoneCode[]

const timezoneCatalogBase = timezoneCodes.map((code) => {
	const enLabel = en_US[code] || code
	const offsetMinutes = parseOffsetMinutes(enLabel)
	return {
		code,
		offsetMinutes,
		offset: formatOffset(offsetMinutes),
		city: parseCityFromLabel(enLabel),
	}
})

export const timezoneCatalog = Object.freeze(timezoneCatalogBase)
export const timezoneCodeSet = new Set(timezoneCatalog.map((item) => item.code))
