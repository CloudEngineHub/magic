import { describe, expect, it } from "vitest"

import {
	getPluginRuntimeMessageCapability,
	getPluginRuntimeResultType,
	parsePluginRuntimeMessage,
	pluginHasCapability,
} from "../runtime/v1"

describe("plugin runtime protocol", () => {
	it("rejects messages without the current channel token", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "stale-token",
					type: "magic-canvas-plugin:get-image-models",
					requestId: "request-1",
				},
				"active-token",
			),
		).toBeNull()
	})

	it("rejects malformed request messages", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:get-image-models",
				},
				"active-token",
			),
		).toBeNull()
	})

	it("parses valid request messages", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:pick-files",
					requestId: "request-1",
					options: {
						type: "image",
						multiple: true,
						maxCount: 3,
						accept: ["image/png", 12],
					},
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:pick-files",
			requestId: "request-1",
			options: {
				type: "image",
				multiple: true,
				maxCount: 3,
				accept: ["image/png"],
			},
			triggerPoint: undefined,
		})
	})

	it("maps runtime messages to capabilities and result messages", () => {
		expect(getPluginRuntimeMessageCapability("magic-canvas-plugin:pick-files")).toBe(
			"assets.pickFiles",
		)
		expect(getPluginRuntimeResultType("magic-canvas-plugin:pick-files")).toBe(
			"magic-canvas-plugin:pick-files-result",
		)
	})

	it("checks manifest capability declarations strictly", () => {
		expect(
			pluginHasCapability(
				{
					capabilities: ["ui.toast"],
				},
				"ui.toast",
			),
		).toBe(true)
		expect(
			pluginHasCapability(
				{
					capabilities: ["ui.toast"],
				},
				"assets.pickFiles",
			),
		).toBe(false)
		expect(pluginHasCapability({}, "ui.toast")).toBe(false)
	})
})
