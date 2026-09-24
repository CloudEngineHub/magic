import { describe, expect, it } from "vitest"
import { mergeWidgetConfig, normalizeWidgetConfig, resolveInitialWidgetConfig } from "../src/config"

describe("Widget config", () => {
	it("uses the legacy mobile layout and viewport semantics as initial defaults", () => {
		expect(resolveInitialWidgetConfig(undefined)).toEqual({
			layout: "mobile",
			responsive: { mobileDetection: "viewport" },
		})
	})

	it("keeps explicit initial layout and responsive overrides", () => {
		expect(
			resolveInitialWidgetConfig({
				layout: "desktop",
				responsive: { mobileDetection: "device-and-viewport" },
			}),
		).toEqual({
			layout: "desktop",
			responsive: { mobileDetection: "device-and-viewport" },
		})
	})

	it("normalizes the supported layout and visibility fields", () => {
		expect(
			normalizeWidgetConfig({
				layout: "desktop",
				shell: { appSidebar: false },
				responsive: { mobileDetection: "device-and-viewport" },
				conversation: {
					projectFiles: false,
					topicHistory: true,
					autoHire: false,
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
				autoHire: false,
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
					conversation: {
						topicHistory: true,
						autoHire: false,
						previewMode: "switchable",
					},
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
				autoHire: false,
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
		expect(() => normalizeWidgetConfig({ conversation: { autoHire: "yes" } })).toThrow(
			/autoHire/,
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
		expect(() => normalizeWidgetConfig({ header: { topicName: { mode: "static" } } })).toThrow(
			/topicName.text/,
		)
		expect(() => normalizeWidgetConfig({ header: { title: "   " } })).toThrow(/header\.title/)
		expect(() => normalizeWidgetConfig({ panel: { agents: false } })).toThrow(/panel\.agents/)
		expect(() =>
			normalizeWidgetConfig({ header: { topicName: { mode: "static", text: "   " } } }),
		).toThrow(/topicName\.text/)
		expect(() => normalizeWidgetConfig({ bottom: { upload: { enabled: "yes" } } })).toThrow(
			/upload.enabled/,
		)
		expect(() => normalizeWidgetConfig({ bottom: { model: { enabled: false } } })).toThrow(
			/bottom\.model\.enabled/,
		)
	})

	it("normalizes Widget customization and merges nested updates", () => {
		const initial = normalizeWidgetConfig({
			header: {
				visible: true,
				title: "Mock Assistant",
				topicName: { mode: "current" },
				actions: { fullscreen: true, share: false, close: false },
			},
			panel: {
				projectFiles: false,
				uploadFiles: false,
				otherProjectFiles: false,
				digitalEmployees: false,
				microApps: false,
				workflows: false,
				connectors: false,
				skills: false,
				canvasElements: false,
			},
			bottom: {
				internetSearch: { enabled: true, buttonVisible: false },
				upload: { enabled: false, buttonVisible: false },
				model: { buttonVisible: false },
			},
			window: { closable: false },
		})

		expect(initial.header?.title).toBe("Mock Assistant")
		expect(
			normalizeWidgetConfig({ header: { title: "  Mock Assistant  " } }).header?.title,
		).toBe("Mock Assistant")
		expect(initial.header?.actions).toEqual({ fullscreen: true, share: false, close: false })
		expect(initial.panel).toEqual({
			projectFiles: false,
			uploadFiles: false,
			otherProjectFiles: false,
			digitalEmployees: false,
			microApps: false,
			workflows: false,
			connectors: false,
			skills: false,
			canvasElements: false,
		})
		expect(initial.bottom?.internetSearch).toEqual({ enabled: true, buttonVisible: false })
		expect(initial.bottom?.model).toEqual({ buttonVisible: false })
		expect(initial.window).toEqual({ closable: false })

		expect(
			mergeWidgetConfig(initial, {
				panel: { workflows: false },
				header: { actions: { more: false } },
				bottom: { upload: { buttonVisible: true } },
			}),
		).toEqual({
			header: {
				visible: true,
				title: "Mock Assistant",
				topicName: { mode: "current" },
				actions: { fullscreen: true, share: false, close: false, more: false },
			},
			panel: {
				projectFiles: false,
				uploadFiles: false,
				otherProjectFiles: false,
				digitalEmployees: false,
				microApps: false,
				workflows: false,
				connectors: false,
				skills: false,
				canvasElements: false,
			},
			bottom: {
				internetSearch: { enabled: true, buttonVisible: false },
				upload: { enabled: false, buttonVisible: true },
				model: { buttonVisible: false },
			},
			window: { closable: false },
		})
	})
})
