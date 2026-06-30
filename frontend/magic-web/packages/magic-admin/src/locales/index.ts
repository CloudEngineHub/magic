export { createI18nNext, Language } from "./creator"

export type LocaleResourceLoader = () => Promise<unknown>

export interface AdminLocaleModules {
	adminZhCNModules: Record<string, LocaleResourceLoader>
	adminEnUSModules: Record<string, LocaleResourceLoader>
}

export function getAdminLocaleModules(): AdminLocaleModules {
	return {
		adminZhCNModules: import.meta.glob("./zh_CN/**/*.json"),
		adminEnUSModules: import.meta.glob("./en_US/**/*.json"),
	}
}
