import { describe, expect, it } from "vitest"
import { StylePanelStore } from "../StylePanelStore"

describe("StylePanelStore more styles tab cache", () => {
	it("remembers a tab per selector and clears it on reset", () => {
		const store = new StylePanelStore()

		store.rememberMoreStylesTab("img.hero", "layout")
		store.rememberMoreStylesTab("img.cover", "border")

		expect(store.getMoreStylesTab("img.hero")).toBe("layout")
		expect(store.getMoreStylesTab("img.cover")).toBe("border")

		store.reset()

		expect(store.getMoreStylesTab("img.hero")).toBeUndefined()
		expect(store.getMoreStylesTab("img.cover")).toBeUndefined()
	})

	it("ignores empty selectors and tabs", () => {
		const store = new StylePanelStore()

		store.rememberMoreStylesTab("", "layout")
		store.rememberMoreStylesTab("img.hero", "")

		expect(store.getMoreStylesTab("img.hero")).toBeUndefined()
		expect(store.getMoreStylesTab("")).toBeUndefined()
	})
})
