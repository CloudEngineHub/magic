import { afterEach, describe, expect, it } from "vitest"

import {
	PLUGIN_PANEL_SIZE_CACHE_KEY,
	PLUGIN_WINDOW_DEFAULT_HEIGHT,
	PLUGIN_WINDOW_MAX_HEIGHT,
	PLUGIN_WINDOW_MAX_WIDTH,
	PLUGIN_WINDOW_MIN_HEIGHT,
	PLUGIN_WINDOW_MIN_WIDTH,
	PLUGIN_WINDOW_WIDTH,
} from "../constants"
import {
	clampPluginPanelSize,
	getCachedPluginPanelSize,
	saveCachedPluginPanelSize,
} from "../position"

describe("plugin panel position", () => {
	afterEach(() => {
		window.localStorage.removeItem(PLUGIN_PANEL_SIZE_CACHE_KEY)
	})

	it("clamps plugin panel size to supported bounds", () => {
		expect(clampPluginPanelSize({ width: 120, height: 80 })).toEqual({
			width: PLUGIN_WINDOW_MIN_WIDTH,
			height: PLUGIN_WINDOW_MIN_HEIGHT,
		})
		expect(clampPluginPanelSize({ width: 1200, height: 1200 })).toEqual({
			width: PLUGIN_WINDOW_MAX_WIDTH,
			height: PLUGIN_WINDOW_MAX_HEIGHT,
		})
		expect(clampPluginPanelSize({ width: Number.NaN, height: Number.NaN })).toEqual({
			width: PLUGIN_WINDOW_WIDTH,
			height: PLUGIN_WINDOW_DEFAULT_HEIGHT,
		})
	})

	it("stores cached plugin panel size after clamping", () => {
		saveCachedPluginPanelSize({ width: 1200, height: 1200 })

		expect(getCachedPluginPanelSize()).toEqual({
			width: PLUGIN_WINDOW_MAX_WIDTH,
			height: PLUGIN_WINDOW_MAX_HEIGHT,
		})
	})
})
