import { describe, expect, it } from "vitest"
import { mergeWidgetConfig, normalizeWidgetConfig } from "../src/config"

describe("Widget config", () => {
	it("normalizes the supported layout and visibility fields", () => {
		expect(
			normalizeWidgetConfig({
				layout: "desktop",
				shell: { appSidebar: false },
				conversation: { projectFiles: false, topicHistory: true },
			}),
		).toEqual({
			layout: "desktop",
			shell: { appSidebar: false },
			conversation: { projectFiles: false, topicHistory: true },
		})
	})

	it("merges nested updates without dropping previously confirmed fields", () => {
		expect(
			mergeWidgetConfig(
				{
					layout: "desktop",
					shell: { appSidebar: false },
					conversation: { projectFiles: false },
				},
				{ conversation: { topicHistory: true } },
			),
		).toEqual({
			layout: "desktop",
			shell: { appSidebar: false },
			conversation: { projectFiles: false, topicHistory: true },
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
	})
})
