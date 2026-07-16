import { describe, expect, it, vi } from "vitest"
import type { Rect } from "../../shared/ids"
import type { AlignmentInfo } from "../snap/snapGuideTypes"
import { SnapGuideManager } from "../snap/SnapGuideManager"
import { SequenceSpacingResolver } from "../snap/SequenceSpacingResolver"
import { SpacingSnapResolver } from "../snap/SpacingSnapResolver"
import type { SpacingSnapTarget } from "../snap/spacingSnapTypes"

function createAlignment(type: AlignmentInfo["type"], position: number): AlignmentInfo {
	return {
		type,
		position,
		targetElementId: `target-${type}`,
		dragPoints: [],
		targetPoints: [],
	}
}

function createManagerWithBounds(getElementsBounds: ReturnType<typeof vi.fn>) {
	const manager = Object.create(SnapGuideManager.prototype) as SnapGuideManager & {
		activeAnchor: string | null
		currentDragBoundsOverride: Rect | null
		currentAppliedDragBoundsOverride: Rect | null
		currentSnappedDragBoundsOverride: Rect | null
		canvas: {
			eventEmitter?: {
				emit: ReturnType<typeof vi.fn>
			}
			geometryCacheManager: {
				getElementsBounds: typeof getElementsBounds
			}
		}
		emitSelectionPositionOverride: (boundingRect: Rect) => void
		getDraggingElementsRect: (elementIds: string[]) => Rect | null
		getSnappedElementsRect: (fallbackRect?: Rect) => Rect | null
		resolveRawDragBounds: (appliedBounds: Rect | null) => Rect | null
		syncSnappedProxyDragBounds: (boundingRect: Rect) => void
	}

	manager.canvas = {
		geometryCacheManager: {
			getElementsBounds,
		},
	}

	return manager
}

describe("SnapGuideManager transient drag bounds", () => {
	it("uses the drag bounds override for translation snapping", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = null
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }

		expect(manager.getDraggingElementsRect(["element-1"])).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
		expect(getElementsBounds).not.toHaveBeenCalled()
	})

	it("keeps anchor scaling on the normal geometry path", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = "top-left"
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }

		expect(manager.getDraggingElementsRect(["element-1"])).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 10,
		})
		expect(getElementsBounds).toHaveBeenCalledWith(["element-1"])
	})

	it("publishes snapped proxy drag bounds back to selection UI", () => {
		const emit = vi.fn()
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = null
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.canvas.eventEmitter = { emit }

		manager.syncSnappedProxyDragBounds({ x: 24, y: 36, width: 100, height: 80 })

		expect(emit).toHaveBeenCalledWith({
			type: "selection:position",
			data: {
				boundingRect: { x: 24, y: 36, width: 100, height: 80 },
			},
		})
		expect(manager.currentDragBoundsOverride).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
		expect(manager.currentSnappedDragBoundsOverride).toEqual({
			x: 24,
			y: 36,
			width: 100,
			height: 80,
		})
	})

	it("uses snapped bounds for guide rendering without replacing raw drag input", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = null
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.currentSnappedDragBoundsOverride = { x: 24, y: 36, width: 100, height: 80 }

		expect(manager.getDraggingElementsRect(["element-1"])).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
		expect(manager.getSnappedElementsRect({ x: 99, y: 99, width: 1, height: 1 })).toEqual({
			x: 24,
			y: 36,
			width: 100,
			height: 80,
		})
	})

	it("preserves raw drag coordinates when Konva reports the previous snapped position", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.currentSnappedDragBoundsOverride = { x: 24, y: 36, width: 100, height: 80 }

		expect(manager.resolveRawDragBounds({ x: 24, y: 42, width: 100, height: 80 })).toEqual({
			x: 20,
			y: 42,
			width: 100,
			height: 80,
		})
	})

	it("does not publish drag bounds while anchor scaling", () => {
		const emit = vi.fn()
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = "top-left"
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.canvas.eventEmitter = { emit }

		manager.syncSnappedProxyDragBounds({ x: 24, y: 36, width: 100, height: 80 })

		expect(emit).not.toHaveBeenCalled()
		expect(manager.currentDragBoundsOverride).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
	})
})

describe("SnapGuideManager alignment behavior", () => {
	it("keeps every coincident point relationship for parallel equal-size elements", () => {
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			cachedSnapThreshold: number
			calculateSnapResult: (
				alignments: AlignmentInfo[],
				draggingRect: Rect,
			) => {
				snappedAlignments: AlignmentInfo[]
				snapOffsetX: number
				snapOffsetY: number
			}
		}
		manager.cachedSnapThreshold = 8

		const result = manager.calculateSnapResult(
			[
				createAlignment("top", 0),
				createAlignment("middle", 512),
				createAlignment("bottom", 1024),
			],
			{ x: 1200, y: 0, width: 1024, height: 1024 },
		)

		expect(result.snapOffsetY).toBe(0)
		expect(result.snappedAlignments.map((alignment) => alignment.type)).toEqual([
			"top",
			"middle",
			"bottom",
		])
	})

	it("uses equal-spacing snap when no closer direct alignment exists", () => {
		const spacingTargets: SpacingSnapTarget[] = [
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "c", rect: { x: 400, y: 0, width: 100, height: 100 } },
		]
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			activeAnchor: string | null
			cachedSnapThreshold: number
			spacingSnapResolver: SpacingSnapResolver
			sequenceSpacingResolver: SequenceSpacingResolver
			cachedSequenceSpacingTargets: SpacingSnapTarget[]
			getSpacingSnapTargets: () => SpacingSnapTarget[]
			resolveTranslationSnap: (params: {
				selectedIds: string[]
				draggingRect: Rect
				targets: []
				directResult: null
			}) => {
				snapOffsetX: number
				spacingGuides: Array<{ targetElementIds: [string, string] }>
			}
		}
		manager.activeAnchor = null
		manager.cachedSnapThreshold = 8
		manager.spacingSnapResolver = new SpacingSnapResolver()
		manager.sequenceSpacingResolver = new SequenceSpacingResolver()
		manager.cachedSequenceSpacingTargets = []
		manager.getSpacingSnapTargets = () => spacingTargets

		const result = manager.resolveTranslationSnap({
			selectedIds: ["b"],
			draggingRect: { x: 205, y: 0, width: 100, height: 100 },
			targets: [],
			directResult: null,
		})

		expect(result.snapOffsetX).toBe(-5)
		expect(result.spacingGuides).toMatchObject([{ targetElementIds: ["a", "c"] }])
	})

	it("extends an existing spacing pair through the shared translation snap path", () => {
		const sequenceTargets: SpacingSnapTarget[] = [
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
		]
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			activeAnchor: string | null
			cachedSnapThreshold: number
			spacingSnapResolver: SpacingSnapResolver
			sequenceSpacingResolver: SequenceSpacingResolver
			cachedSequenceSpacingTargets: SpacingSnapTarget[]
			getSpacingSnapTargets: () => SpacingSnapTarget[]
			resolveTranslationSnap: (params: {
				selectedIds: string[]
				draggingRect: Rect
				targets: []
				directResult: null
			}) => {
				snapOffsetX: number
				spacingGuides: Array<{ targetElementIds: [string, string] }>
			}
		}
		manager.activeAnchor = null
		manager.cachedSnapThreshold = 16
		manager.spacingSnapResolver = new SpacingSnapResolver()
		manager.sequenceSpacingResolver = new SequenceSpacingResolver()
		manager.sequenceSpacingResolver.prepare(sequenceTargets)
		manager.cachedSequenceSpacingTargets = sequenceTargets
		manager.getSpacingSnapTargets = () => []

		const result = manager.resolveTranslationSnap({
			selectedIds: ["c"],
			draggingRect: { x: 390, y: 0, width: 100, height: 100 },
			targets: [],
			directResult: null,
		})

		expect(result.snapOffsetX).toBe(10)
		expect(result.spacingGuides).toMatchObject([{ targetElementIds: ["a", "b"] }])
	})

	it("keeps a locked spacing pair through minor movement and releases after the hysteresis window", () => {
		const spacingTargets: SpacingSnapTarget[] = [
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "c", rect: { x: 400, y: 0, width: 100, height: 100 } },
		]
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			activeSpacingSnapTargets: Partial<
				Record<
					"horizontal" | "vertical",
					{ mode: "between"; targetElementIds: [string, string] }
				>
			>
			cachedSnapThreshold: number
			spacingSnapResolver: SpacingSnapResolver
			sequenceSpacingResolver: SequenceSpacingResolver
			stabilizeSpacingCandidate: (params: {
				axis: "horizontal" | "vertical"
				draggingRect: Rect
				targets: SpacingSnapTarget[]
				baseCandidate: {
					mode: "between"
					referenceTargets: SpacingSnapTarget[]
					offset: number
					gap: number
				} | null
			}) => { referenceTargets: SpacingSnapTarget[]; offset: number } | null
		}
		manager.activeSpacingSnapTargets = {
			horizontal: { mode: "between", targetElementIds: ["a", "c"] },
		}
		manager.cachedSnapThreshold = 8
		manager.spacingSnapResolver = new SpacingSnapResolver()
		manager.sequenceSpacingResolver = new SequenceSpacingResolver()

		const stableCandidate = manager.stabilizeSpacingCandidate({
			axis: "horizontal",
			draggingRect: { x: 209, y: 0, width: 100, height: 100 },
			targets: spacingTargets,
			baseCandidate: null,
		})
		expect(stableCandidate?.referenceTargets.map((target) => target.id)).toEqual(["a", "c"])

		const releasedCandidate = manager.stabilizeSpacingCandidate({
			axis: "horizontal",
			draggingRect: { x: 212, y: 0, width: 100, height: 100 },
			targets: spacingTargets,
			baseCandidate: null,
		})
		expect(releasedCandidate).toBeNull()
	})

	it("opens linked-axis guides when a selected element keeps its aspect ratio", () => {
		const shouldKeepRatio = vi.fn(() => true)
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			canvas: {
				selectionManager: { getSelectedIds: () => string[] }
				transformManager: { shouldKeepRatio: typeof shouldKeepRatio }
			}
			getAllowedAlignments: (anchor: string) => Set<string>
		}
		manager.canvas = {
			selectionManager: { getSelectedIds: () => ["text-1"] },
			transformManager: { shouldKeepRatio },
		}

		expect(manager.getAllowedAlignments("top-center")).toEqual(new Set(["top", "left"]))
		expect(shouldKeepRatio).toHaveBeenCalledWith(["text-1"])
	})

	it("does not build snap targets for a mixed hierarchy selection", () => {
		const canSnap = vi.fn(() => true)
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			canvas: {
				permissionManager: { canSnap: typeof canSnap }
				elementManager: {
					getParentAndSiblings: (elementId: string) => unknown
				}
			}
			getAlignmentTargets: (elementIds: string[]) => unknown[]
		}
		manager.canvas = {
			permissionManager: { canSnap },
			elementManager: {
				getParentAndSiblings: (elementId) =>
					elementId === "root"
						? { parentElement: null, siblings: [] }
						: { parentElement: { id: "frame-1" }, siblings: [] },
			},
		}

		expect(manager.getAlignmentTargets(["root", "child"])).toEqual([])
		expect(canSnap).not.toHaveBeenCalled()
	})

	it("cleans up only its own subscriptions and leaves the shared overlay layer intact", () => {
		const clear = vi.fn()
		const unsubscribe = vi.fn()
		const overlayDestroy = vi.fn()
		const clearInteractionTargets = vi.fn()
		const manager = Object.create(SnapGuideManager.prototype) as unknown as {
			canvas: { overlayLayer: { destroy: typeof overlayDestroy } }
			guideRenderer: { clear: typeof clear }
			eventUnsubscribers: Array<() => void>
			clearInteractionTargets: typeof clearInteractionTargets
			destroy: () => void
		}
		manager.canvas = { overlayLayer: { destroy: overlayDestroy } }
		manager.guideRenderer = { clear }
		manager.eventUnsubscribers = [unsubscribe]
		manager.clearInteractionTargets = clearInteractionTargets

		manager.destroy()

		expect(unsubscribe).toHaveBeenCalledOnce()
		expect(clearInteractionTargets).toHaveBeenCalledOnce()
		expect(overlayDestroy).not.toHaveBeenCalled()
	})
})
