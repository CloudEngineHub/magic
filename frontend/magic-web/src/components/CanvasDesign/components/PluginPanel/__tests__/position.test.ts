import { afterEach, describe, expect, it } from "vitest"

import { PLUGIN_PANEL_POSITION_CACHE_PREFIX } from "../constants"
import { resetCachedPositionIfCoveredByPluginList, saveCachedPosition } from "../position"

const CACHE_KEY = `${PLUGIN_PANEL_POSITION_CACHE_PREFIX}shared`

function mockRect(
	element: HTMLElement,
	rect: {
		left: number
		top: number
		right: number
		bottom: number
		width: number
		height: number
	},
) {
	element.getBoundingClientRect = () =>
		({
			...rect,
			x: rect.left,
			y: rect.top,
			toJSON: () => rect,
		}) as DOMRect
}

describe("plugin panel position", () => {
	afterEach(() => {
		document.body.innerHTML = ""
		window.localStorage.removeItem(CACHE_KEY)
	})

	it("clears cached position when plugin window is covered by plugin list", () => {
		const pluginList = document.createElement("div")
		pluginList.setAttribute("data-canvas-plugin-list-panel", "")
		mockRect(pluginList, {
			left: 100,
			top: 20,
			right: 580,
			bottom: 440,
			width: 480,
			height: 420,
		})

		const pluginWindow = document.createElement("div")
		pluginWindow.setAttribute("data-canvas-plugin-window", "")
		mockRect(pluginWindow, {
			left: 300,
			top: 80,
			right: 720,
			bottom: 440,
			width: 420,
			height: 360,
		})

		document.body.append(pluginList, pluginWindow)
		saveCachedPosition({ x: 300, y: 80 })

		expect(resetCachedPositionIfCoveredByPluginList()).toBe(true)
		expect(window.localStorage.getItem(CACHE_KEY)).toBeNull()
	})

	it("keeps cached position when plugin window is not covered by plugin list", () => {
		const pluginList = document.createElement("div")
		pluginList.setAttribute("data-canvas-plugin-list-panel", "")
		mockRect(pluginList, {
			left: 100,
			top: 20,
			right: 580,
			bottom: 440,
			width: 480,
			height: 420,
		})

		const pluginWindow = document.createElement("div")
		pluginWindow.setAttribute("data-canvas-plugin-window", "")
		mockRect(pluginWindow, {
			left: 620,
			top: 80,
			right: 1040,
			bottom: 440,
			width: 420,
			height: 360,
		})

		document.body.append(pluginList, pluginWindow)
		saveCachedPosition({ x: 620, y: 80 })

		expect(resetCachedPositionIfCoveredByPluginList()).toBe(false)
		expect(window.localStorage.getItem(CACHE_KEY)).toBe(JSON.stringify({ x: 620, y: 80 }))
	})
})
