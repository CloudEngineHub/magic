import i18next, { type i18n as I18nInstance } from "i18next"
import resourcesToBackend from "i18next-resources-to-backend"
import { initReactI18next } from "react-i18next"

export type LocaleResourceLoader = () => Promise<unknown>
export type LocaleResourceLoaderMap = Record<string, LocaleResourceLoader>

interface ResourceModule {
	default?: unknown
}

const DEFAULT_LANGUAGE = "zh_CN"
const FALLBACK_LANGUAGE = "zh_CN"
const NAMESPACE_ALIASES: Record<string, string> = {
	common: "admin/common",
}
const DEFAULT_NAMESPACES = ["admin/common", "translation"]

function normalizeLanguage(language?: string) {
	return language || DEFAULT_LANGUAGE
}

function normalizeNamespace(namespace: string) {
	return NAMESPACE_ALIASES[namespace] ?? namespace
}

function getResourcePathSuffix(language: string, namespace: string) {
	return `/${language}/${normalizeNamespace(namespace)}.json`
}

function getResourceNamespaces(localeModules: LocaleResourceLoaderMap) {
	const namespaces = new Set(DEFAULT_NAMESPACES)

	Object.keys(localeModules).forEach((path) => {
		const normalizedPath = path.replace(/\\/g, "/")
		const match = normalizedPath.match(/(?:^|\/)[a-z]{2,3}_[A-Z]{2}\/(.+)\.json$/)
		const namespace = match?.[1]

		if (!namespace?.startsWith("admin/")) return
		namespaces.add(normalizeNamespace(namespace))
	})

	return Array.from(namespaces)
}

function findResourceLoader(
	localeModules: LocaleResourceLoaderMap,
	language: string,
	namespace: string,
) {
	const suffix = getResourcePathSuffix(language, namespace)
	return Object.entries(localeModules).find(([path]) => path.endsWith(suffix))?.[1] ?? null
}

async function loadResource(
	localeModules: LocaleResourceLoaderMap,
	language: string,
	namespace: string,
) {
	const loader = findResourceLoader(localeModules, language, namespace)
	if (!loader) return {}

	const module = (await loader()) as ResourceModule
	return module.default ?? module
}

export function createAdminI18n(localeModules: LocaleResourceLoaderMap) {
	const adminI18n = i18next.createInstance()
	const namespaces = getResourceNamespaces(localeModules)
	let initPromise: Promise<I18nInstance> | null = null
	let backendRegistered = false

	const initAdminI18n = async (language?: string) => {
		const nextLanguage = normalizeLanguage(language)

		if (!initPromise) {
			if (!backendRegistered) {
				adminI18n.use(initReactI18next).use(
					resourcesToBackend((lng: string, namespace: string) => {
						return loadResource(localeModules, normalizeLanguage(lng), namespace)
					}),
				)
				backendRegistered = true
			}

			initPromise = adminI18n
				.init({
					lng: nextLanguage,
					fallbackLng: FALLBACK_LANGUAGE,
					defaultNS: "admin/common",
					ns: namespaces,
					fallbackNS: ["translation"],
					load: "currentOnly",
					react: {
						useSuspense: false,
					},
					interpolation: {
						escapeValue: false,
					},
				})
				.then(() => adminI18n)
		}

		await initPromise
		if (adminI18n.language !== nextLanguage) {
			await adminI18n.changeLanguage(nextLanguage)
		}

		return adminI18n
	}

	return {
		adminI18n,
		initAdminI18n,
	}
}
