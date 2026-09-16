import type { Canvas } from "../../core/Canvas"
import type { Rect } from "../ids"
import { getViewportCanvasRect } from "../placement/elementUtils"
import { containsRect, expandRect, intersectsRect } from "./GeometryCacheManager"

const CANVAS_VIEWPORT_NEAR_PADDING_RATIO = 2
const CANVAS_VIEWPORT_LABEL_PADDING_RATIO = 0.5
const CANVAS_VIEWPORT_COVERAGE_PADDING_RATIO = 2.5

export interface CanvasViewportSpatialSnapshot {
	generation: number
	geometryRevision: number
	viewportScale: number
	viewportRect: Rect
	nearRect: Rect
	visibleElementIds: ReadonlySet<string>
	nearElementIds: ReadonlySet<string>
	labelElementIds: readonly string[]
}

interface CoverageElement {
	elementId: string
	bounds: Rect
}

interface ViewportCoverageCache {
	geometryRevision: number
	coverageRect: Rect
	elements: CoverageElement[]
}

function areRectsEqual(left: Rect, right: Rect): boolean {
	return (
		left.x === right.x &&
		left.y === right.y &&
		left.width === right.width &&
		left.height === right.height
	)
}

/**
 * Owns the spatial result for one Canvas viewport generation.
 *
 * A buffered coverage is queried once. Pan/zoom frames whose exact near rect remains inside that
 * coverage only reclassify cached candidates, allowing visibility, consumers and labels to share
 * one result without changing visible/near semantics.
 */
export class CanvasViewportQueryCoordinator {
	private readonly canvas: Canvas
	private coverageCache: ViewportCoverageCache | null = null
	private currentSnapshot: CanvasViewportSpatialSnapshot | null = null
	private generation = 0
	private destroyed = false

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public getSnapshot(): CanvasViewportSpatialSnapshot {
		const viewportRect = getViewportCanvasRect(this.canvas)
		const viewportScale = this.canvas.stage.scaleX() || 1
		const geometryRevision = this.canvas.geometryCacheManager.getRevision()
		const current = this.currentSnapshot
		if (
			current &&
			current.geometryRevision === geometryRevision &&
			current.viewportScale === viewportScale &&
			areRectsEqual(current.viewportRect, viewportRect)
		) {
			return current
		}

		const longEdge = Math.max(viewportRect.width, viewportRect.height)
		const nearRect = expandRect(viewportRect, longEdge * CANVAS_VIEWPORT_NEAR_PADDING_RATIO)
		const labelRect = expandRect(viewportRect, longEdge * CANVAS_VIEWPORT_LABEL_PADDING_RATIO)
		let coverage = this.coverageCache
		if (
			!coverage ||
			coverage.geometryRevision !== geometryRevision ||
			!containsRect(coverage.coverageRect, nearRect)
		) {
			coverage = this.rebuildCoverage(viewportRect, geometryRevision)
		}

		const visibleElementIds = new Set<string>()
		const nearElementIds = new Set<string>()
		const labelElementIds: string[] = []
		for (const element of coverage.elements) {
			const visible = intersectsRect(element.bounds, viewportRect)
			if (visible) visibleElementIds.add(element.elementId)
			else if (intersectsRect(element.bounds, nearRect)) {
				nearElementIds.add(element.elementId)
			}
			if (intersectsRect(element.bounds, labelRect)) {
				labelElementIds.push(element.elementId)
			}
		}

		this.generation += 1
		const snapshot: CanvasViewportSpatialSnapshot = {
			generation: this.generation,
			geometryRevision,
			viewportScale,
			viewportRect,
			nearRect,
			visibleElementIds,
			nearElementIds,
			labelElementIds,
		}
		this.currentSnapshot = snapshot
		return snapshot
	}

	public destroy(): void {
		this.destroyed = true
		this.coverageCache = null
		this.currentSnapshot = null
	}

	private rebuildCoverage(viewportRect: Rect, geometryRevision: number): ViewportCoverageCache {
		if (this.destroyed) {
			return { geometryRevision, coverageRect: { ...viewportRect }, elements: [] }
		}

		const coveragePadding =
			Math.max(viewportRect.width, viewportRect.height) *
			CANVAS_VIEWPORT_COVERAGE_PADDING_RATIO
		const coverageRect = expandRect(viewportRect, coveragePadding)
		const elementIds = this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
			viewportRect,
			coveragePadding,
		)
		const elements: CoverageElement[] = []
		for (const elementId of elementIds) {
			const bounds = this.canvas.geometryCacheManager.getElementBounds(elementId)
			if (bounds) elements.push({ elementId, bounds })
		}

		const coverage = { geometryRevision, coverageRect, elements }
		this.coverageCache = coverage
		return coverage
	}
}
