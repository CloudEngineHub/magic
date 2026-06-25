import { describe, expect, it } from "vitest"
import { getInspectorDetailHeaderLabel } from "../display"

describe("inspector-detail display", () => {
	it("uses a compact fixed header label instead of element details", () => {
		const t = (key: string) =>
			key === "stylePanel.inspector.selectedElement" ? "已选取的元素" : key

		expect(getInspectorDetailHeaderLabel(t)).toBe("已选取的元素")
	})
})
