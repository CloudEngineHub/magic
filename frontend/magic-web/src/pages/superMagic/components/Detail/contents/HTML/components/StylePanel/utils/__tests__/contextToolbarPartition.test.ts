import { describe, expect, it } from "vitest"
import {
	CONTEXT_TOOLBAR_ROW_MAX_WIDTH,
	partitionContextToolGroups,
	type ContextToolGroup,
} from "../contextToolbarPartition"

describe("partitionContextToolGroups", () => {
	it("returns a single row when group list is empty or has one item", () => {
		expect(partitionContextToolGroups([])).toEqual([[]])
		const single: ContextToolGroup[] = [{ id: "actions", estimatedWidth: 120 }]
		expect(partitionContextToolGroups(single)).toEqual([single])
	})

	it("keeps a single row when total width is within maxRowWidth", () => {
		const groups: ContextToolGroup[] = [
			{ id: "actions", estimatedWidth: 120 },
			{ id: "background", estimatedWidth: 36 },
			{ id: "more", estimatedWidth: 76 },
		]
		const result = partitionContextToolGroups(groups, CONTEXT_TOOLBAR_ROW_MAX_WIDTH)
		expect(result).toHaveLength(1)
		expect(result[0]).toEqual(groups)
	})

	it("splits into two balanced rows when total width exceeds maxRowWidth", () => {
		const groups: ContextToolGroup[] = [
			{ id: "actions", estimatedWidth: 124 },
			{ id: "typography", estimatedWidth: 232 },
			{ id: "formatting", estimatedWidth: 116 },
			{ id: "alignment", estimatedWidth: 96 },
			{ id: "appearance", estimatedWidth: 64 },
			{ id: "more", estimatedWidth: 76 },
		]
		const result = partitionContextToolGroups(groups, 500)
		expect(result).toHaveLength(2)
		// Row 1: actions (124) + typography (232) = 356
		// Row 2: formatting (116) + alignment (96) + appearance (64) + more (76) = 352
		expect(result[0].map((g) => g.id)).toEqual(["actions", "typography"])
		expect(result[1].map((g) => g.id)).toEqual([
			"formatting",
			"alignment",
			"appearance",
			"more",
		])
	})

	it("balances rows effectively when an item is heavy", () => {
		const groups: ContextToolGroup[] = [
			{ id: "heavy", estimatedWidth: 300 },
			{ id: "a", estimatedWidth: 80 },
			{ id: "b", estimatedWidth: 80 },
			{ id: "c", estimatedWidth: 80 },
		]
		const result = partitionContextToolGroups(groups, 400)
		expect(result).toHaveLength(2)
		expect(result[0].map((g) => g.id)).toEqual(["heavy"])
		expect(result[1].map((g) => g.id)).toEqual(["a", "b", "c"])
	})
})
