import { describe, expect, it } from "vitest"
import type { SuperMagicMessageItem } from "../type"
import {
	buildVirtualMessageProjection,
	composeVirtualMessageItems,
	createStickyRangeExtractor,
	findActiveStickyIndex,
} from "../virtual-message-items"

function message(
	superMessageId: string,
	role: SuperMagicMessageItem["role"],
): SuperMagicMessageItem {
	return {
		super_message_id: superMessageId,
		app_message_id: `app-${superMessageId}`,
		role,
	} as unknown as SuperMagicMessageItem
}

describe("virtual message projection", () => {
	it("keeps every converted message flat while retaining turn ownership", () => {
		const projection = buildVirtualMessageProjection([
			message("leading", "assistant"),
			message("user-1", "user"),
			message("assistant-1", "assistant"),
			message("tool-1", "tool"),
			message("user-2", "user"),
			message("assistant-2", "assistant"),
		])

		expect(projection.items.map((item) => item.key)).toEqual([
			"leading",
			"user-1",
			"assistant-1",
			"tool-1",
			"user-2",
			"assistant-2",
		])
		expect(projection.items.map((item) => item.turnKey)).toEqual([
			"leading-messages",
			"turn-user-1",
			"turn-user-1",
			"turn-user-1",
			"turn-user-2",
			"turn-user-2",
		])
		expect(projection.userIndices).toEqual([1, 4])
		expect(projection.messageKeys).toEqual([
			"leading",
			"user-1",
			"assistant-1",
			"tool-1",
			"user-2",
			"assistant-2",
		])
	})

	it("finds the latest User at or before the visible start", () => {
		expect(findActiveStickyIndex([2, 7, 11], 1)).toBeUndefined()
		expect(findActiveStickyIndex([2, 7, 11], 2)).toBe(2)
		expect(findActiveStickyIndex([2, 7, 11], 10)).toBe(7)
		expect(findActiveStickyIndex([2, 7, 11], 99)).toBe(11)
	})

	it("adds only the active User to TanStack's visible range", () => {
		const rangeExtractor = createStickyRangeExtractor([0, 4])

		expect(
			rangeExtractor({
				startIndex: 3,
				endIndex: 4,
				overscan: 1,
				count: 6,
			}),
		).toEqual([0, 2, 3, 4, 5])
	})

	it("composes revoked messages into the same flat list and limits only the collapsed preview", () => {
		const normal = buildVirtualMessageProjection([
			message("normal-user", "user"),
			message("normal-assistant", "assistant"),
		])
		const revoked = buildVirtualMessageProjection([
			message("revoked-user", "user"),
			message("revoked-assistant-1", "assistant"),
			message("revoked-assistant-2", "assistant"),
		])

		const collapsed = composeVirtualMessageItems({
			normalItems: normal.items,
			revokedItems: revoked.items,
			firstRevokedUserKey: "revoked-user",
			includeRevoked: true,
			revokedPreviewExpanded: false,
			collapsedPreviewLimit: 1,
		})

		expect(collapsed.items.map((item) => item.key)).toEqual([
			"normal-user",
			"normal-assistant",
			"revoked-user",
			"revoked-assistant-1",
		])
		expect(collapsed.items.map((item) => item.renderMode)).toEqual([
			"message",
			"message",
			"revoked-editable",
			"revoked-preview",
		])
		expect(collapsed.userIndices).toEqual([0, 2])
		expect(collapsed.items.slice(2).every((item) => !item.exportSelectable)).toBe(true)

		const expanded = composeVirtualMessageItems({
			normalItems: normal.items,
			revokedItems: revoked.items,
			firstRevokedUserKey: "revoked-user",
			includeRevoked: true,
			revokedPreviewExpanded: true,
			collapsedPreviewLimit: 1,
		})
		expect(expanded.items.map((item) => item.key)).toContain("revoked-assistant-2")
	})
})
