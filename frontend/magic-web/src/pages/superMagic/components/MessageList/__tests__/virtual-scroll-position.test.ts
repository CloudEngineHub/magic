import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual"
import { shouldAdjustVirtualMessageScrollPosition } from "../virtual-scroll-position"

/** Builds the minimal virtualizer state needed to exercise the scroll-adjustment policy. */
const createVirtualizer = ({
	scrollOffset,
	scrollDirection,
	measuredItem,
}: {
	scrollOffset: number
	scrollDirection: "forward" | "backward" | null
	measuredItem?: VirtualItem
}) =>
	({
		// Expose the public viewport offset without requiring a DOM scroll element.
		scrollOffset,
		scrollDirection,
		itemSizeCache: new Map(measuredItem ? [[measuredItem.key, measuredItem.size]] : undefined),
	}) as unknown as Virtualizer<HTMLDivElement, HTMLDivElement>

const virtualMessageListSource = readFileSync(
	resolve(
		process.cwd(),
		"src/pages/superMagic/components/MessageList/components/VirtualMessageList.tsx",
	),
	"utf8",
)

describe("shouldAdjustVirtualMessageScrollPosition", () => {
	const virtualItem: VirtualItem = {
		index: 0,
		key: "message-fixture",
		start: 100,
		end: 300,
		size: 200,
		lane: 0,
	}

	it("disables every item-size correction while the user scrolls upward", () => {
		// First measurements must not enter TanStack's deferred iOS adjustment queue.
		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({ scrollOffset: 400, scrollDirection: "backward" }),
			),
		).toBe(false)

		// Re-measurements must follow the same rule during the same gesture.
		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({
					scrollOffset: 400,
					scrollDirection: "backward",
					measuredItem: virtualItem,
				}),
			),
		).toBe(false)
	})

	it("preserves TanStack's first-measurement anchoring outside upward scrolling", () => {
		// The public offset keeps the first-measurement boundary aligned with the viewport.
		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({
					scrollOffset: 130,
					scrollDirection: "forward",
				}),
			),
		).toBe(true)

		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({ scrollOffset: 100, scrollDirection: null }),
			),
		).toBe(false)
	})

	it("only adjusts settled re-measurements that are fully above the viewport", () => {
		// A row spanning the fold grows below the reading anchor and must not move the viewport.
		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({
					scrollOffset: 200,
					scrollDirection: null,
					measuredItem: virtualItem,
				}),
			),
		).toBe(false)

		expect(
			shouldAdjustVirtualMessageScrollPosition(
				virtualItem,
				120,
				createVirtualizer({
					scrollOffset: 300,
					scrollDirection: null,
					measuredItem: virtualItem,
				}),
			),
		).toBe(true)
	})

	it("uses Virtuoso as the shared virtual message list implementation", () => {
		expect(virtualMessageListSource).toContain("GroupedVirtuoso")
		expect(virtualMessageListSource).not.toContain("useVirtualizer")
	})
})
