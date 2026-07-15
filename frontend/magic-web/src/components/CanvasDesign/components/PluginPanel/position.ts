import {
	PLUGIN_PANEL_POSITION_CACHE_PREFIX,
	PLUGIN_WINDOW_DEFAULT_HEIGHT,
	PLUGIN_WINDOW_MARGIN,
	PLUGIN_WINDOW_MAX_HEIGHT,
	PLUGIN_WINDOW_MIN_HEIGHT,
	PLUGIN_WINDOW_WIDTH,
} from "./constants"
import type { PluginWindowPosition } from "./types"

const PLUGIN_LIST_PANEL_SELECTOR = "[data-canvas-plugin-list-panel]"
const PLUGIN_WINDOW_SELECTOR = "[data-canvas-plugin-window]"
const SHARED_POSITION_CACHE_KEY = `${PLUGIN_PANEL_POSITION_CACHE_PREFIX}shared`

export function getInitialPosition(container: HTMLElement): PluginWindowPosition {
	const cachedPosition = readCachedPosition()
	return clampPositionToContainer(
		cachedPosition ?? getPluginListAnchoredPosition(container),
		container,
	)
}

export function clampPluginPanelHeight(height: number): number {
	return Math.min(PLUGIN_WINDOW_MAX_HEIGHT, Math.max(PLUGIN_WINDOW_MIN_HEIGHT, height))
}

export function saveCachedPosition(position: PluginWindowPosition): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(SHARED_POSITION_CACHE_KEY, JSON.stringify(position))
	} catch (error) {
		console.warn("[PluginPanel] Failed to cache plugin panel position.", error)
	}
}

export function resetCachedPositionIfCoveredByPluginList(container?: HTMLElement): boolean {
	if (typeof document === "undefined") return false
	const pluginListPanel = document.querySelector<HTMLElement>(PLUGIN_LIST_PANEL_SELECTOR)
	if (!pluginListPanel) return false
	const pluginWindow = document.querySelector<HTMLElement>(PLUGIN_WINDOW_SELECTOR)
	const pluginWindowRect =
		pluginWindow?.getBoundingClientRect() ?? getCachedPluginWindowRect(container)
	if (!pluginWindowRect) return false
	if (!areRectsOverlapping(pluginWindowRect, pluginListPanel.getBoundingClientRect())) {
		return false
	}
	clearCachedPosition()
	return true
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

function clearCachedPosition(): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.removeItem(SHARED_POSITION_CACHE_KEY)
	} catch (error) {
		console.warn("[PluginPanel] Failed to clear cached plugin panel position.", error)
	}
}

function getCachedPluginWindowRect(container: HTMLElement | undefined): DOMRect | null {
	if (!container) return null
	const cachedPosition = readCachedPosition()
	if (!cachedPosition) return null
	const containerRect = container.getBoundingClientRect()
	const left = containerRect.left + cachedPosition.x
	const top = containerRect.top + cachedPosition.y
	return {
		x: left,
		y: top,
		left,
		top,
		right: left + PLUGIN_WINDOW_WIDTH,
		bottom: top + PLUGIN_WINDOW_DEFAULT_HEIGHT,
		width: PLUGIN_WINDOW_WIDTH,
		height: PLUGIN_WINDOW_DEFAULT_HEIGHT,
		toJSON: () => ({
			x: left,
			y: top,
			left,
			top,
			right: left + PLUGIN_WINDOW_WIDTH,
			bottom: top + PLUGIN_WINDOW_DEFAULT_HEIGHT,
			width: PLUGIN_WINDOW_WIDTH,
			height: PLUGIN_WINDOW_DEFAULT_HEIGHT,
		}),
	} as DOMRect
}

function areRectsOverlapping(first: DOMRect, second: DOMRect): boolean {
	return (
		first.left < second.right &&
		first.right > second.left &&
		first.top < second.bottom &&
		first.bottom > second.top
	)
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
		cachedValue = window.localStorage.getItem(SHARED_POSITION_CACHE_KEY)
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
			window.localStorage.removeItem(SHARED_POSITION_CACHE_KEY)
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
