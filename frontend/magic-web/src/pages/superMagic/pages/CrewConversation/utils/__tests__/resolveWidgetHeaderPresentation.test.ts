import { describe, expect, it } from "vitest"
import {
	isWidgetBuiltinActionVisible,
	isWidgetHeaderActionVisible,
	resolveWidgetHeaderPresentation,
} from "../resolveWidgetHeaderPresentation"

const fallbackTitle = "Mock Widget Title"

describe("resolveWidgetHeaderPresentation", () => {
	it("keeps the live topic title and every action when header config is omitted", () => {
		const presentation = resolveWidgetHeaderPresentation({ fallbackTitle })

		expect(presentation.visible).toBe(true)
		expect(presentation.showClose).toBe(true)
		expect(presentation.title).toEqual({
			primary: fallbackTitle,
			secondaryMode: "live",
			renameEnabled: true,
		})
		expect(isWidgetBuiltinActionVisible(presentation, "newTopic")).toBe(true)
		expect(isWidgetHeaderActionVisible(presentation, "fullscreen")).toBe(true)
		expect(isWidgetHeaderActionVisible(presentation, "close")).toBe(true)
	})

	it("hides the header and uses a trimmed host title", () => {
		const presentation = resolveWidgetHeaderPresentation({
			fallbackTitle,
			header: { visible: false, title: "  Mock Assistant  " },
		})

		expect(presentation.visible).toBe(false)
		expect(presentation.title.primary).toBe("Mock Assistant")
	})

	it("keeps static and hidden topic labels out of rename", () => {
		const staticPresentation = resolveWidgetHeaderPresentation({
			fallbackTitle,
			header: { topicName: { mode: "static", text: "Mock Topic" } },
		})
		const hiddenPresentation = resolveWidgetHeaderPresentation({
			fallbackTitle,
			header: { topicName: { mode: "hidden" } },
		})

		expect(staticPresentation.title).toMatchObject({
			secondaryMode: "fixed",
			secondaryText: "Mock Topic",
			renameEnabled: false,
		})
		expect(hiddenPresentation.title).toMatchObject({
			secondaryMode: "fixed",
			secondaryText: "",
			renameEnabled: false,
		})
	})

	it("hides only the actions explicitly set to false", () => {
		const presentation = resolveWidgetHeaderPresentation({
			fallbackTitle,
			header: {
				actions: {
					fullscreen: false,
					pin: false,
					newTopic: false,
					history: false,
					share: false,
					more: false,
					close: false,
				},
			},
		})

		expect(presentation.showClose).toBe(false)
		expect(isWidgetHeaderActionVisible(presentation, "fullscreen")).toBe(false)
		expect(isWidgetHeaderActionVisible(presentation, "pin")).toBe(false)
		expect(isWidgetBuiltinActionVisible(presentation, "newTopic")).toBe(false)
		expect(isWidgetBuiltinActionVisible(presentation, "history")).toBe(false)
		expect(isWidgetBuiltinActionVisible(presentation, "share")).toBe(false)
		expect(isWidgetBuiltinActionVisible(presentation, "more")).toBe(false)
	})

	it("follows window closable only when close is omitted", () => {
		const closedWindow = resolveWidgetHeaderPresentation({
			fallbackTitle,
			windowClosable: false,
		})
		const forcedClose = resolveWidgetHeaderPresentation({
			fallbackTitle,
			windowClosable: false,
			header: { actions: { close: true } },
		})

		expect(closedWindow.showClose).toBe(false)
		expect(forcedClose.showClose).toBe(true)
	})
})
