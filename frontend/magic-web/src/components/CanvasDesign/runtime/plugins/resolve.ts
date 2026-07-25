import type { CanvasDesignPlugin } from "../document/types"

export const DEFAULT_PLUGIN_LOCALE = "zh-CN"

const MEDIA_ICON_PATTERN = /\.(png|jpe?g|webp|gif|svg)$/i
const VARIATION_SELECTOR_16 = 0xfe0f

function countGraphemes(value: string) {
	if (typeof Intl !== "undefined" && Intl.Segmenter) {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
		return [...segmenter.segment(value)].length
	}

	const codePoints = [...value]
	if (codePoints.length === 2 && codePoints[1]?.codePointAt(0) === VARIATION_SELECTOR_16) {
		return 1
	}

	return codePoints.length
}

export type ResolvedPluginIcon =
	| {
			type: "emoji"
			value: string
	  }
	| {
			type: "image"
			value: string
	  }

export function normalizePluginLocale(locale: string | undefined) {
	if (!locale) return DEFAULT_PLUGIN_LOCALE
	const normalized = locale.replace(/_/g, "-")
	const [language, region] = normalized.split("-")
	if (!language) return DEFAULT_PLUGIN_LOCALE
	if (!region) return language.toLowerCase()
	return `${language.toLowerCase()}-${region.toUpperCase()}`
}

export function resolvePluginText(plugin: CanvasDesignPlugin, value: string, locale: string) {
	const match = value.match(/^\{\{(.+)\}\}$/)
	if (!match) return value

	const key = match[1]?.trim()
	if (!key) return value

	const messages =
		plugin.locales?.[locale] ??
		plugin.locales?.[locale.split("-")[0] ?? ""] ??
		plugin.locales?.[DEFAULT_PLUGIN_LOCALE] ??
		plugin.locales?.["en-US"]

	return messages?.[key] ?? key
}

export function resolvePluginIcon(plugin: CanvasDesignPlugin): ResolvedPluginIcon | null {
	if (!plugin.icon) return null
	const icon = plugin.icon.trim()
	if (countGraphemes(icon) === 1) {
		return {
			type: "emoji",
			value: icon,
		}
	}

	if (!MEDIA_ICON_PATTERN.test(icon)) return null
	if (!isSafePluginRelativePath(icon)) return null

	return {
		type: "image",
		value: plugin.resourceBaseUrl
			? new URL(icon, plugin.resourceBaseUrl).href
			: resolvePluginPackagePath(plugin, icon),
	}
}

export function isSafePluginRelativePath(path: string) {
	const normalizedPath = path.trim()
	if (!normalizedPath) return false
	if (/^[a-z][a-z\d+\-.]*:/i.test(normalizedPath)) return false
	if (normalizedPath.startsWith("/") || normalizedPath.startsWith("\\")) return false
	return normalizedPath.split(/[\\/]+/).every(isSafePluginPathSegment)
}

export function resolvePluginPackagePath(plugin: CanvasDesignPlugin, path: string) {
	const pluginDir = plugin.entry.split("/").slice(0, -1).join("/")
	const normalizedPath = path.replace(/^\.\/+/, "")

	if (!pluginDir) return normalizedPath
	return `${pluginDir}/${normalizedPath}`
}

function isSafePluginPathSegment(segment: string): boolean {
	if (segment === "..") return false
	let decodedSegment: string
	try {
		decodedSegment = decodeURIComponent(segment)
	} catch {
		return false
	}
	return decodedSegment !== ".." && !/[\\/]/.test(decodedSegment)
}
