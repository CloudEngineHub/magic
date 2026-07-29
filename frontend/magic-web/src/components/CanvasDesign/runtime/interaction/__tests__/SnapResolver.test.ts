import { describe, expect, it, vi } from "vitest"
import { SnapResolver, type SnapResolverContext } from "../snap/SnapResolver"
import type { AlignmentInfo } from "../snap/snapGuideTypes"
import type { Rect } from "../../shared/ids"

function createAlignment(type: AlignmentInfo["type"], position: number): AlignmentInfo {
	return {
		type,
		position,
		targetElementId: `target-${type}`,
		dragPoints: [],
		targetPoints: [],
	}
}

function createResolver(options: {
	alignments: AlignmentInfo[]
	snapOffsetX?: number
	snapOffsetY?: number
}): SnapResolver {
	const ctx: SnapResolverContext = {
		ensureCache: vi.fn(),
		findAlignments: vi.fn(() => options.alignments),
		calculateSnapResult: vi.fn(() => ({
			snappedAlignments: options.alignments,
			snapOffsetX: options.snapOffsetX ?? 0,
			snapOffsetY: options.snapOffsetY ?? 0,
		})),
		getAlignmentTargets: vi.fn(() => []),
		calculateElementsRect: vi.fn(() => null),
		getAllowedAlignments: vi.fn(() => new Set()),
	}

	return new SnapResolver(ctx)
}

describe("SnapResolver keep-ratio snapping", () => {
	it("preserves size when translation snapping aligns edges", () => {
		const resolver = createResolver({
			alignments: [createAlignment("left", 0), createAlignment("top", 10)],
			snapOffsetX: -8,
			snapOffsetY: 6,
		})
		const draggingRect: Rect = { x: 8, y: 4, width: 100, height: 50 }

		const result = resolver.resolveInContentSpace({
			draggingRect,
			targets: [],
			activeAnchor: null,
		})

		expect(result?.snappedRect).toEqual({
			x: 0,
			y: 10,
			width: 100,
			height: 50,
		})
		expect(result?.snappedAlignments.map((alignment) => alignment.type)).toEqual([
			"left",
			"top",
		])
	})

	it("uses horizontal snap as the size driver for a Shift-constrained edge anchor", () => {
		const resolver = createResolver({
			alignments: [createAlignment("left", 0)],
			snapOffsetX: -1,
		})
		const draggingRect: Rect = { x: 1, y: 0, width: 100, height: 50 }

		const result = resolver.resolveInContentSpace({
			draggingRect,
			targets: [],
			activeAnchor: "top-center",
			options: { keepRatio: true, aspectRatio: 2 },
		})

		expect(result?.snappedRect).toEqual({
			x: 0,
			y: -0.5,
			width: 101,
			height: 50.5,
		})
		expect(result?.snappedAlignments.map((alignment) => alignment.type)).toEqual(["left"])
	})

	it("filters guide alignments that no longer match after keep-ratio constraint", () => {
		const resolver = createResolver({
			alignments: [createAlignment("left", 0), createAlignment("top", 0)],
			snapOffsetX: -1,
			snapOffsetY: -2,
		})
		const draggingRect: Rect = { x: 1, y: 2, width: 100, height: 50 }

		const result = resolver.resolveInContentSpace({
			draggingRect,
			targets: [],
			activeAnchor: "top-center",
			options: { keepRatio: true, aspectRatio: 2 },
		})

		expect(result?.snappedRect).toEqual({
			x: -3,
			y: 0,
			width: 104,
			height: 52,
		})
		expect(result?.snappedAlignments.map((alignment) => alignment.type)).toEqual(["top"])
	})
})
