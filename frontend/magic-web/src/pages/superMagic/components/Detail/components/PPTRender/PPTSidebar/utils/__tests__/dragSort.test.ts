import type { VirtualItem } from "@tanstack/react-virtual"
import { describe, expect, it } from "vitest"
import { getEdgeAutoScrollDelta, moveItemToGap, resolveSlideGapTarget } from "../dragSort"

function makeVirtualItem(index: number, start: number, size = 120): VirtualItem {
	return {
		key: `slide-${index}`,
		index,
		start,
		end: start + size,
		size,
		lane: 0,
	}
}

function makeItems() {
	return [
		{ id: "slide-1", index: 0 },
		{ id: "slide-2", index: 1 },
		{ id: "slide-3", index: 2 },
	]
}

describe("moveItemToGap", () => {
	it("moves the first item to the final insertion boundary", () => {
		const result = moveItemToGap(makeItems(), "slide-1", 3)

		expect(result.map((item) => item.id)).toEqual(["slide-2", "slide-3", "slide-1"])
		expect(result.map((item) => item.index)).toEqual([0, 1, 2])
	})

	it("moves the final item to the start and to a middle boundary", () => {
		const items = makeItems()

		expect(moveItemToGap(items, "slide-3", 0).map((item) => item.id)).toEqual([
			"slide-3",
			"slide-1",
			"slide-2",
		])
		expect(moveItemToGap(items, "slide-3", 1).map((item) => item.id)).toEqual([
			"slide-1",
			"slide-3",
			"slide-2",
		])
	})

	it("returns the original array for both boundaries adjacent to the source", () => {
		const items = makeItems()

		expect(moveItemToGap(items, "slide-2", 1)).toBe(items)
		expect(moveItemToGap(items, "slide-2", 2)).toBe(items)
	})

	it("clamps insertion boundaries to the valid range", () => {
		const items = makeItems()

		expect(moveItemToGap(items, "slide-3", -10).map((item) => item.id)).toEqual([
			"slide-3",
			"slide-1",
			"slide-2",
		])
		expect(moveItemToGap(items, "slide-1", 99).map((item) => item.id)).toEqual([
			"slide-2",
			"slide-3",
			"slide-1",
		])
	})

	it("uses the stable id even when stored indices are stale", () => {
		const items = [
			{ id: "slide-1", index: 99 },
			{ id: "slide-2", index: -1 },
		]

		const result = moveItemToGap(items, "slide-1", 2)

		expect(result).toEqual([
			{ id: "slide-2", index: 0 },
			{ id: "slide-1", index: 1 },
		])
	})

	it("returns the original array when the dragged id does not exist", () => {
		const items = makeItems()

		expect(moveItemToGap(items, "missing", 0)).toBe(items)
	})
})

describe("resolveSlideGapTarget", () => {
	const virtualItems = [makeVirtualItem(0, 0), makeVirtualItem(1, 140), makeVirtualItem(2, 280)]

	it("resolves the empty-list boundary without mounted virtual items", () => {
		expect(resolveSlideGapTarget([], 100, 0)).toEqual({ gapIndex: 0, offset: 0 })
	})

	it("returns null when a non-empty list has no measured virtual items", () => {
		expect(resolveSlideGapTarget([], 100, 3)).toBeNull()
	})

	it("resolves the boundary in whitespace between two rows", () => {
		expect(resolveSlideGapTarget(virtualItems, 130, 3)).toEqual({
			gapIndex: 1,
			offset: 120,
		})
	})

	it("resolves the final boundary from whitespace below the final row", () => {
		expect(resolveSlideGapTarget(virtualItems, 480, 3)).toEqual({
			gapIndex: 3,
			offset: 400,
		})
	})

	it("does not depend on virtual item input order", () => {
		expect(
			resolveSlideGapTarget([virtualItems[2], virtualItems[0], virtualItems[1]], 150, 3),
		).toEqual({
			gapIndex: 1,
			offset: 140,
		})
	})

	it("ignores a pinned dragged source far beyond the visible range", () => {
		const visibleItems = [makeVirtualItem(100, 10_000), makeVirtualItem(101, 10_140)]
		const pinnedSource = makeVirtualItem(499, 50_000)

		expect(resolveSlideGapTarget([...visibleItems, pinnedSource], 10_130, 500)).toEqual({
			gapIndex: 101,
			offset: 10_120,
		})
	})
})

describe("getEdgeAutoScrollDelta", () => {
	it.each([
		[100, -20],
		[128, -5],
		[156, 0],
		[300, 0],
		[444, 0],
		[472, 5],
		[500, 20],
	])(
		"returns the expected vertical delta at pointer position %i",
		(pointerPosition, expected) => {
			expect(
				getEdgeAutoScrollDelta({
					pointerPosition,
					containerStart: 100,
					containerEnd: 500,
					edgeSize: 56,
					maxSpeed: 20,
				}),
			).toBe(expected)
		},
	)

	it("does not keep scrolling after the pointer leaves the container", () => {
		expect(
			getEdgeAutoScrollDelta({
				pointerPosition: 99,
				containerStart: 100,
				containerEnd: 500,
				edgeSize: 56,
				maxSpeed: 20,
			}),
		).toBe(0)
		expect(
			getEdgeAutoScrollDelta({
				pointerPosition: 501,
				containerStart: 100,
				containerEnd: 500,
				edgeSize: 56,
				maxSpeed: 20,
			}),
		).toBe(0)
	})
})
