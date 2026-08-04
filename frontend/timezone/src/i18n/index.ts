import { TimezoneError, TimezoneErrorCode } from "../constants/errors"
import type { Timezone } from "../core/types"
import en_US from "./locales/en_US"
import zh_CN from "./locales/zh_CN"

const localeStore = new Map<string, Record<string, string>>([
	["en_US", en_US],
	["zh_CN", zh_CN],
])

let defaultLocale: Timezone.Locale = "en_US"

export const registerLocale = (locale: string, messages: Record<string, string>): void => {
	if (!locale || !messages || typeof messages !== "object") {
		throw new TimezoneError(
			TimezoneErrorCode.LOCALE_NOT_FOUND,
			"locale and messages are required when registering locale",
		)
	}
	localeStore.set(locale, messages)
}

export const setDefaultLocale = (locale: Timezone.Locale): void => {
	if (!localeStore.has(locale)) {
		throw new TimezoneError(TimezoneErrorCode.LOCALE_NOT_FOUND, `locale not found: ${locale}`)
	}
	defaultLocale = locale
}

export const getDefaultLocale = (): Timezone.Locale => defaultLocale

export const getSupportedLocales = (): string[] => Array.from(localeStore.keys())

export const resolveLocaleLabel = (timezoneCode: string, locale?: Timezone.Locale): string => {
	const activeLocale = locale || defaultLocale
	const activeMessages = localeStore.get(activeLocale)
	const fallbackEn = localeStore.get("en_US")
	return activeMessages?.[timezoneCode] || fallbackEn?.[timezoneCode] || timezoneCode
}

export const hasLocale = (locale: Timezone.Locale): boolean => localeStore.has(locale)
