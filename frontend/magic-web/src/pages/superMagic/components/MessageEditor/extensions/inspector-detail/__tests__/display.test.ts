import { describe, expect, it } from "vitest"
import { getInspectorDetailHeaderLabel } from "../display"

describe("inspector-detail display", () => {
	it("uses the element text as the header label", () => {
		const t = (key: string) =>
			key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key

		expect(getInspectorDetailHeaderLabel(t, "  hello\nworld  ")).toBe("hello world")
	})

	it("falls back to the translated label when the element has no text", () => {
		const t = (key: string) =>
			key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key

		expect(getInspectorDetailHeaderLabel(t, "   ")).toBe("已选取的元素")
	})
})
