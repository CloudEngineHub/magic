import {
	PLUGIN_PANEL_POSITION_CACHE_PREFIX,
	PLUGIN_WINDOW_MARGIN,
	PLUGIN_WINDOW_MAX_HEIGHT,
	PLUGIN_WINDOW_MIN_HEIGHT,
	PLUGIN_WINDOW_WIDTH,
} from "./constants"
import type { PluginWindowPosition } from "./types"

export function getInitialPosition(
	container: HTMLElement,
	pluginName: string | undefined,
): PluginWindowPosition {
	const rect = container.getBoundingClientRect()
	const cachedPosition = pluginName ? readCachedPosition(pluginName) : null
	return clampPositionToContainer(
		cachedPosition ?? {
			x: rect.width - PLUGIN_WINDOW_WIDTH - PLUGIN_WINDOW_MARGIN,
			y: PLUGIN_WINDOW_MARGIN,
		},
		container,
	)
}

export function clampPluginPanelHeight(height: number): number {
	return Math.min(PLUGIN_WINDOW_MAX_HEIGHT, Math.max(PLUGIN_WINDOW_MIN_HEIGHT, height))
}

export function saveCachedPosition(pluginName: string, position: PluginWindowPosition): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(getPositionCacheKey(pluginName), JSON.stringify(position))
	} catch (error) {
		console.warn("[PluginPanel] Failed to cache plugin panel position.", error)
	}
}

export function clampPositionToContainer(
	position: PluginWindowPosition,
	container: HTMLElement,
	pluginWindow?: HTMLElement | null,
): PluginWindowPosition {
	const rect = container.getBoundingClientRect()
	const pluginWindowRect = pluginWindow?.getBoundingClientRect()
	const pluginWindowWidth = pluginWindowRect?.width ?? PLUGIN_WINDOW_WIDTH
	const pluginWindowHeight = pluginWindowRect?.height ?? 0
	const maxX = Math.max(
		PLUGIN_WINDOW_MARGIN,
		rect.width - pluginWindowWidth - PLUGIN_WINDOW_MARGIN,
	)
	const maxY = Math.max(
		PLUGIN_WINDOW_MARGIN,
		rect.height - pluginWindowHeight - PLUGIN_WINDOW_MARGIN,
	)

	return {
		x: Math.min(Math.max(PLUGIN_WINDOW_MARGIN, position.x), maxX),
		y: Math.min(Math.max(PLUGIN_WINDOW_MARGIN, position.y), maxY),
	}
}

function getPositionCacheKey(pluginName: string): string {
	return `${PLUGIN_PANEL_POSITION_CACHE_PREFIX}${pluginName}`
}

function readCachedPosition(pluginName: string): PluginWindowPosition | null {
	if (typeof window === "undefined") return null
	const cacheKey = getPositionCacheKey(pluginName)
	let cachedValue: string | null
	try {
		cachedValue = window.localStorage.getItem(cacheKey)
	} catch (error) {
		console.warn("[PluginPanel] Failed to read cached plugin panel position.", error)
		return null
	}
	if (!cachedValue) return null
	let position: Partial<PluginWindowPosition>
	try {
		position = JSON.parse(cachedValue) as Partial<PluginWindowPosition>
	} catch (error) {
		console.warn("[PluginPanel] Failed to parse cached plugin panel position.", error)
		try {
			window.localStorage.removeItem(cacheKey)
		} catch (removeError) {
			console.warn(
				"[PluginPanel] Failed to remove invalid plugin panel position cache.",
				removeError,
			)
		}
		return null
	}
	if (typeof position.x !== "number" || typeof position.y !== "number") return null
	return {
		x: position.x,
		y: position.y,
	}
}
