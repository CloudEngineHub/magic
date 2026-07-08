import { createI18nInstance } from "@/assets/locales/create-helpers"
import { getLocaleModules, loadFallbackLocale, loadMagicFlowLocale } from "./locale-adapters"

export function createI18nNext(defaultLang?: string) {
	return createI18nInstance(defaultLang, {
		getLocaleModules,
		loadFallbackLocale,
		loadMagicFlowLocale,
	})
}
