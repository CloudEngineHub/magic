import { describe, expect, it } from "vitest"
import { mergeWidgetConfig, normalizeWidgetConfig } from "../src/config"

describe("Widget config", () => {
	it("normalizes the supported layout and visibility fields", () => {
		expect(
			normalizeWidgetConfig({
				layout: "desktop",
				shell: { appSidebar: false },
				responsive: { mobileDetection: "device-and-viewport" },
				conversation: {
					projectFiles: false,
					topicHistory: true,
					previewMode: "fullscreen",
				},
			}),
		).toEqual({
			layout: "desktop",
			shell: { appSidebar: false },
			responsive: { mobileDetection: "device-and-viewport" },
			conversation: {
				projectFiles: false,
				topicHistory: true,
				previewMode: "fullscreen",
			},
		})
	})

	it("merges nested updates without dropping previously confirmed fields", () => {
		expect(
			mergeWidgetConfig(
				{
					layout: "desktop",
					shell: { appSidebar: false },
					responsive: { mobileDetection: "viewport" },
					conversation: { projectFiles: false },
				},
				{
					conversation: { topicHistory: true, previewMode: "switchable" },
					responsive: { mobileDetection: "device-and-viewport" },
				},
			),
		).toEqual({
			layout: "desktop",
			shell: { appSidebar: false },
			responsive: { mobileDetection: "device-and-viewport" },
			conversation: {
				projectFiles: false,
				topicHistory: true,
				previewMode: "switchable",
			},
		})
	})

	it("rejects invalid and undeclared configuration fields", () => {
		expect(() => normalizeWidgetConfig({ layout: "tablet" })).toThrow(/config\.layout/)
		expect(() => normalizeWidgetConfig({ shell: { globalNotice: false } })).toThrow(
			/globalNotice/,
		)
		expect(() => normalizeWidgetConfig({ conversation: { projectFiles: "no" } })).toThrow(
			/projectFiles/,
		)
		expect(() => normalizeWidgetConfig({ conversation: { previewMode: "overlay" } })).toThrow(
			/previewMode/,
		)
		expect(() => normalizeWidgetConfig({ conversation: { previewMode: true } })).toThrow(
			/previewMode/,
		)
		expect(() =>
			normalizeWidgetConfig({ responsive: { mobileDetection: "device-only" } }),
		).toThrow(/mobileDetection/)
		expect(() => normalizeWidgetConfig({ responsive: { mobileDetection: true } })).toThrow(
			/mobileDetection/,
		)
		expect(() => normalizeWidgetConfig({ responsive: { breakpoint: 640 } })).toThrow(
			/breakpoint/,
		)
	})
})
