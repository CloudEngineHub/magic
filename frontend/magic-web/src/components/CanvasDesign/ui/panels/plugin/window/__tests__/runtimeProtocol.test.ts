import { describe, expect, it } from "vitest"

import {
	getPluginRuntimeMessageCapability,
	getPluginRuntimeResultType,
	parsePluginRuntimeMessage,
	pluginHasCapability,
} from "../../runtime-protocol/v1/index"

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

	it("parses complete-image-prompt requests", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:complete-image-prompt",
					requestId: "request-2",
					params: {
						user_prompt: "生成背景提示词",
						reference_images: ["./product-a.png"],
					},
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:complete-image-prompt",
			requestId: "request-2",
			params: {
				user_prompt: "生成背景提示词",
				reference_images: ["./product-a.png"],
			},
		})
	})

	it("maps runtime messages to capabilities and result messages", () => {
		expect(getPluginRuntimeMessageCapability("magic-canvas-plugin:pick-files")).toBe(
			"assets.pickFiles",
		)
		expect(
			getPluginRuntimeMessageCapability("magic-canvas-plugin:canvas-asset-drag-target"),
		).toBe("assets.pickFiles")
		expect(getPluginRuntimeResultType("magic-canvas-plugin:pick-files")).toBe(
			"magic-canvas-plugin:pick-files-result",
		)
		expect(getPluginRuntimeMessageCapability("magic-canvas-plugin:complete-image-prompt")).toBe(
			"ai.completeImagePrompt",
		)
		expect(getPluginRuntimeResultType("magic-canvas-plugin:complete-image-prompt")).toBe(
			"magic-canvas-plugin:complete-image-prompt-result",
		)
		expect(getPluginRuntimeMessageCapability("magic-canvas-plugin:read-canvas-clipboard")).toBe(
			"assets.pickFiles",
		)
		expect(getPluginRuntimeResultType("magic-canvas-plugin:read-canvas-clipboard")).toBe(
			"magic-canvas-plugin:read-canvas-clipboard-result",
		)
		expect(getPluginRuntimeMessageCapability("magic-canvas-plugin:resolve-file-assets")).toBe(
			"assets.pickFiles",
		)
		expect(getPluginRuntimeResultType("magic-canvas-plugin:resolve-file-assets")).toBe(
			"magic-canvas-plugin:resolve-file-assets-result",
		)
	})

	it("parses read-canvas-clipboard requests", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:read-canvas-clipboard",
					requestId: "request-3",
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:read-canvas-clipboard",
			requestId: "request-3",
		})
	})

	it("parses resolve-file-assets requests and filters invalid entries", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:resolve-file-assets",
					requestId: "request-4",
					files: [
						{ path: "uploads/a.png", fileName: "a.png" },
						{ path: 123 },
						{ path: "uploads/b.png", fileName: "   " },
					],
					options: { type: "image", maxCount: 2 },
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:resolve-file-assets",
			requestId: "request-4",
			files: [
				{ path: "uploads/a.png", fileName: "a.png" },
				{ path: "uploads/b.png", fileName: undefined },
			],
			options: { type: "image", maxCount: 2 },
		})
	})

	it("parses canvas-asset-drag-target requests with drag session binding", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:canvas-asset-drag-target",
					targetId: "product-grid",
					mode: "grid",
					canDrop: true,
					dragSessionId: "session-1",
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:canvas-asset-drag-target",
			dragSessionId: "session-1",
			targetId: "product-grid",
			mode: "grid",
			canDrop: true,
			importRemaining: undefined,
		})
	})

	it("parses canvas-asset-drag-target importRemaining for grid drop limits", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:canvas-asset-drag-target",
					targetId: "product-grid",
					mode: "grid",
					canDrop: true,
					dragSessionId: "session-1",
					importRemaining: 5,
				},
				"active-token",
			),
		).toEqual({
			type: "magic-canvas-plugin:canvas-asset-drag-target",
			dragSessionId: "session-1",
			targetId: "product-grid",
			mode: "grid",
			canDrop: true,
			importRemaining: 5,
		})
	})

	it("rejects canvas-asset-drag-target without dragSessionId", () => {
		expect(
			parsePluginRuntimeMessage(
				{
					channelToken: "active-token",
					type: "magic-canvas-plugin:canvas-asset-drag-target",
					targetId: "product-grid",
					mode: "grid",
					canDrop: true,
				},
				"active-token",
			),
		).toBeNull()
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
