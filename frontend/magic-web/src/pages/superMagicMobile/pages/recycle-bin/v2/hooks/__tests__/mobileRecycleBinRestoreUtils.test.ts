import { describe, expect, it } from "vitest"
import { parseNonFileRestoreCheck } from "../mobileRecycleBinRestoreUtils"

describe("parseNonFileRestoreCheck", () => {
	it("reads the current conflict response used by micro app restore", () => {
		expect(
			parseNonFileRestoreCheck({
				items_with_conflict: [
					{ resource_id: "app-move", conflict: { type: "parent_missing" } },
				],
				items_no_conflict: [{ resource_id: "app-direct" }],
			}),
		).toEqual({
			needMoveResourceIds: ["app-move"],
			noNeedMoveResourceIds: ["app-direct"],
		})
	})

	it("keeps compatibility with the legacy response fields", () => {
		expect(
			parseNonFileRestoreCheck({
				items_need_move: [{ resource_id: "project-move" }],
				items_no_need_move: [{ resource_id: "project-direct" }],
			}),
		).toEqual({
			needMoveResourceIds: ["project-move"],
			noNeedMoveResourceIds: ["project-direct"],
		})
	})
})
