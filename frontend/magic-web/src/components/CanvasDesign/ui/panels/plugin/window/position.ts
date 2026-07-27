import {
	PLUGIN_PANEL_POSITION_CACHE_KEY,
	PLUGIN_PANEL_SIZE_CACHE_KEY,
	PLUGIN_WINDOW_DEFAULT_HEIGHT,
	PLUGIN_WINDOW_MARGIN,
	PLUGIN_WINDOW_MAX_HEIGHT,
	PLUGIN_WINDOW_MAX_WIDTH,
	PLUGIN_WINDOW_MIN_HEIGHT,
	PLUGIN_WINDOW_MIN_WIDTH,
	PLUGIN_WINDOW_WIDTH,
	PLUGIN_LIST_PANEL_SELECTOR,
} from "./constants"
import type { PluginWindowPosition, PluginWindowSize, PluginWindowSizeBounds } from "./types"

export function getInitialPosition(container: HTMLElement): PluginWindowPosition {
	const cachedPosition = readCachedPosition()
	return clampPositionToContainer(
		cachedPosition ?? getPluginListAnchoredPosition(container),
		container,
	)
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

/* 获取插件列表面板锚点位置 */
function getPluginListAnchoredPosition(container: HTMLElement): PluginWindowPosition {
	const containerRect = container.getBoundingClientRect()
	const pluginListPanel = document.querySelector<HTMLElement>(PLUGIN_LIST_PANEL_SELECTOR)
	const pluginListPanelRect = pluginListPanel?.getBoundingClientRect()
	if (!pluginListPanelRect) {
		return {
			x: containerRect.width - PLUGIN_WINDOW_WIDTH - PLUGIN_WINDOW_MARGIN,
			y: PLUGIN_WINDOW_MARGIN,
		}
	}

	return {
		x: pluginListPanelRect.right - containerRect.left + PLUGIN_WINDOW_MARGIN,
		y: pluginListPanelRect.top - containerRect.top,
	}
}

function readCachedPosition(): PluginWindowPosition | null {
	if (typeof window === "undefined") return null
	let cachedValue: string | null
	try {
		cachedValue = window.localStorage.getItem(PLUGIN_PANEL_POSITION_CACHE_KEY)
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
			window.localStorage.removeItem(PLUGIN_PANEL_POSITION_CACHE_KEY)
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

export function saveCachedPosition(position: PluginWindowPosition): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(PLUGIN_PANEL_POSITION_CACHE_KEY, JSON.stringify(position))
	} catch (error) {
		console.warn("[PluginPanel] Failed to cache plugin panel position.", error)
	}
}

function clampDimension(value: number, min: number, max: number, fallback: number): number {
	const effectiveMax = Math.max(1, max)
	const effectiveMin = Math.min(min, effectiveMax)
	const safeValue = Number.isFinite(value) ? value : fallback
	return Math.min(effectiveMax, Math.max(effectiveMin, safeValue))
}

export function clampPluginPanelHeight(
	height: number,
	maxHeight = PLUGIN_WINDOW_MAX_HEIGHT,
): number {
	const effectiveMaxHeight = Number.isFinite(maxHeight)
		? Math.min(PLUGIN_WINDOW_MAX_HEIGHT, maxHeight)
		: PLUGIN_WINDOW_MAX_HEIGHT
	return clampDimension(
		height,
		PLUGIN_WINDOW_MIN_HEIGHT,
		effectiveMaxHeight,
		PLUGIN_WINDOW_DEFAULT_HEIGHT,
	)
}

export function clampPluginPanelWidth(width: number, maxWidth = PLUGIN_WINDOW_MAX_WIDTH): number {
	const effectiveMaxWidth = Number.isFinite(maxWidth)
		? Math.min(PLUGIN_WINDOW_MAX_WIDTH, maxWidth)
		: PLUGIN_WINDOW_MAX_WIDTH
	return clampDimension(width, PLUGIN_WINDOW_MIN_WIDTH, effectiveMaxWidth, PLUGIN_WINDOW_WIDTH)
}

export function clampPluginPanelSize(
	size: PluginWindowSize,
	bounds: PluginWindowSizeBounds = {},
): PluginWindowSize {
	return {
		width: clampPluginPanelWidth(size.width, bounds.maxWidth),
		height: clampPluginPanelHeight(size.height, bounds.maxHeight),
	}
}

export function getPluginPanelSizeBounds(
	container: HTMLElement,
	pluginWindow: HTMLElement | null | undefined,
	currentSize: PluginWindowSize,
): PluginWindowSizeBounds | null {
	const rect = container.getBoundingClientRect()
	if (rect.width <= PLUGIN_WINDOW_MARGIN * 2 || rect.height <= PLUGIN_WINDOW_MARGIN * 2) {
		return null
	}

	const pluginWindowRect = pluginWindow?.getBoundingClientRect()
	const rawChromeHeight = pluginWindowRect?.height
		? pluginWindowRect.height - currentSize.height
		: 0
	const chromeHeight = Number.isFinite(rawChromeHeight) ? Math.max(0, rawChromeHeight) : 0

	return {
		maxWidth: rect.width - PLUGIN_WINDOW_MARGIN * 2,
		maxHeight: Math.max(1, rect.height - PLUGIN_WINDOW_MARGIN * 2 - chromeHeight),
	}
}

export function getDefaultPluginPanelSize(): PluginWindowSize {
	return {
		width: PLUGIN_WINDOW_WIDTH,
		height: PLUGIN_WINDOW_DEFAULT_HEIGHT,
	}
}

export function getCachedPluginPanelSize(): PluginWindowSize | null {
	if (typeof window === "undefined") return null
	let cachedValue: string | null
	try {
		cachedValue = window.localStorage.getItem(PLUGIN_PANEL_SIZE_CACHE_KEY)
	} catch (error) {
		console.warn("[PluginPanel] Failed to read cached plugin panel size.", error)
		return null
	}
	if (!cachedValue) return null
	let size: Partial<PluginWindowSize>
	try {
		size = JSON.parse(cachedValue) as Partial<PluginWindowSize>
	} catch (error) {
		console.warn("[PluginPanel] Failed to parse cached plugin panel size.", error)
		try {
			window.localStorage.removeItem(PLUGIN_PANEL_SIZE_CACHE_KEY)
		} catch (removeError) {
			console.warn(
				"[PluginPanel] Failed to remove invalid plugin panel size cache.",
				removeError,
			)
		}
		return null
	}
	if (typeof size.width !== "number" || typeof size.height !== "number") return null
	return clampPluginPanelSize({
		width: size.width,
		height: size.height,
	})
}

export function saveCachedPluginPanelSize(size: PluginWindowSize): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(
			PLUGIN_PANEL_SIZE_CACHE_KEY,
			JSON.stringify(clampPluginPanelSize(size)),
		)
	} catch (error) {
		console.warn("[PluginPanel] Failed to cache plugin panel size.", error)
	}
}
