import { createAdminI18n } from "./creator"

export type { LocaleResourceLoader, LocaleResourceLoaderMap } from "./creator"

const localeModules = import.meta.glob("./*/**/*.json")

export const { adminI18n, initAdminI18n } = createAdminI18n(localeModules)
