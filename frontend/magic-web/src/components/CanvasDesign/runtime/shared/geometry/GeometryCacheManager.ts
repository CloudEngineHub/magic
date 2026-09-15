import type { Canvas } from "../../core/Canvas"
import type { LayerElement } from "../../document/types"
import type { Rect } from "../ids"
import {
	registerCanvasSpatialPerfDebugTarget,
	type CanvasSpatialPerfActivityCounters,
} from "./CanvasSpatialPerfDebug"

export interface GeometrySpatialQuerySourceSnapshot {
	queryCount: number
	indexedQueryCount: number
	directScanQueryCount: number
	totalDurationMs: number
	averageDurationMs: number
	maxDurationMs: number
	totalCandidateCount: number
	averageCandidateCount: number
	totalResultCount: number
	averageResultCount: number
	filterQueryCount: number
	totalFilterElementCount: number
	averageFilterElementCount: number
	copiedFilterQueryCount: number
	copiedFilterElementCount: number
	totalVisitedCellCount: number
	averageVisitedCellCount: number
}

export interface GeometrySpatialQueryProfilingSnapshot {
	elapsedMs: number
	queryCount: number
	queriesPerSecond: number
	indexedQueryCount: number
	directScanQueryCount: number
	totalDurationMs: number
	averageDurationMs: number
	maxDurationMs: number
	filterQueryCount: number
	totalFilterElementCount: number
	copiedFilterQueryCount: number
	copiedFilterElementCount: number
	totalVisitedCellCount: number
	totalEstimatedCellCount: number
	totalCandidateCount: number
	totalResultCount: number
	spatialIndexBuildCount: number
	totalSpatialIndexBuildDurationMs: number
	maxSpatialIndexBuildDurationMs: number
	lastSpatialIndexBuildElementCount: number
	sources: Record<string, GeometrySpatialQuerySourceSnapshot>
}

interface GeometrySpatialQueryOptions {
	elementIds?: Iterable<string>
	debugSource?: string
}

interface MutableGeometrySpatialQuerySourceStats {
	queryCount: number
	indexedQueryCount: number
	directScanQueryCount: number
	totalDurationMs: number
	maxDurationMs: number
	totalCandidateCount: number
	totalResultCount: number
	filterQueryCount: number
	totalFilterElementCount: number
	copiedFilterQueryCount: number
	copiedFilterElementCount: number
	totalVisitedCellCount: number
}

interface MutableGeometrySpatialQueryProfilingSession {
	startedAt: number
	queryCount: number
	indexedQueryCount: number
	directScanQueryCount: number
	totalDurationMs: number
	maxDurationMs: number
	filterQueryCount: number
	totalFilterElementCount: number
	copiedFilterQueryCount: number
	copiedFilterElementCount: number
	totalVisitedCellCount: number
	totalEstimatedCellCount: number
	totalCandidateCount: number
	totalResultCount: number
	spatialIndexBuildCount: number
	totalSpatialIndexBuildDurationMs: number
	maxSpatialIndexBuildDurationMs: number
	lastSpatialIndexBuildElementCount: number
	sources: Map<string, MutableGeometrySpatialQuerySourceStats>
}

interface GeometrySpatialQuerySample {
	source: string
	mode: "indexed" | "direct-scan"
	durationMs: number
	filterSize: number
	hasFilter: boolean
	copiedFilter: boolean
	estimatedCellCount: number
	visitedCellCount: number
	candidateCount: number
	resultCount: number
}

function cloneRect(rect: Rect | null): Rect | null {
	if (!rect) return null
	return { ...rect }
}

function mergeRects(rects: Rect[]): Rect | null {
	if (rects.length === 0) {
		return null
	}

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const rect of rects) {
		minX = Math.min(minX, rect.x)
		minY = Math.min(minY, rect.y)
		maxX = Math.max(maxX, rect.x + rect.width)
		maxY = Math.max(maxY, rect.y + rect.height)
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

function expandRect(rect: Rect, padding: number): Rect {
	return {
		x: rect.x - padding,
		y: rect.y - padding,
		width: rect.width + padding * 2,
		height: rect.height + padding * 2,
	}
}

function containsRect(outer: Rect, inner: Rect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	)
}

function intersectsRect(a: Rect, b: Rect): boolean {
	return (
		a.x <= b.x + b.width &&
		a.x + a.width >= b.x &&
		a.y <= b.y + b.height &&
		a.y + a.height >= b.y
	)
}

const DEFAULT_SPATIAL_CELL_SIZE = 2048
const DIRECT_SCAN_CELL_TO_ALLOWED_RATIO = 8

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

function roundMetric(value: number): number {
	return Number(value.toFixed(4))
}

function createSpatialQueryProfilingSession(): MutableGeometrySpatialQueryProfilingSession {
	return {
		startedAt: now(),
		queryCount: 0,
		indexedQueryCount: 0,
		directScanQueryCount: 0,
		totalDurationMs: 0,
		maxDurationMs: 0,
		filterQueryCount: 0,
		totalFilterElementCount: 0,
		copiedFilterQueryCount: 0,
		copiedFilterElementCount: 0,
		totalVisitedCellCount: 0,
		totalEstimatedCellCount: 0,
		totalCandidateCount: 0,
		totalResultCount: 0,
		spatialIndexBuildCount: 0,
		totalSpatialIndexBuildDurationMs: 0,
		maxSpatialIndexBuildDurationMs: 0,
		lastSpatialIndexBuildElementCount: 0,
		sources: new Map(),
	}
}

/**
 * 统一管理元素几何边界缓存。
 *
 * 这一层先提供稳定的缓存/失效接口，后续如果要接空间索引，
 * 可以在不改上层调用方的前提下替换 nearby 查询实现。
 */
export class GeometryCacheManager {
	private canvas: Canvas
	private elementBoundsCache: Map<string, Rect | null> = new Map()
	private allElementsBoundsCache: Rect | null | undefined
	private spatialIndex: Map<string, Set<string>> = new Map()
	private elementSpatialCells: Map<string, string[]> = new Map()
	private spatialIndexDirty = true
	private readonly spatialCellSize = DEFAULT_SPATIAL_CELL_SIZE
	private spatialQueryProfilingSession: MutableGeometrySpatialQueryProfilingSession | null = null
	private unregisterSpatialPerfDebug: () => void = () => undefined

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		if (typeof this.canvas.id === "string" && this.canvas.id) {
			this.unregisterSpatialPerfDebug = registerCanvasSpatialPerfDebugTarget({
				canvasId: this.canvas.id,
				geometryCacheManager: this,
				getElementCount: () => this.canvas.elementManager.getAllElementIds().length,
				getViewportScale: () => this.canvas.stage.scaleX() || 1,
				getActivity: () => this.getSpatialPerfActivityCounters(),
			})
		}
	}

	public startSpatialQueryProfiling(): void {
		this.spatialQueryProfilingSession = createSpatialQueryProfilingSession()
	}

	public isSpatialQueryProfiling(): boolean {
		return this.spatialQueryProfilingSession !== null
	}

	public getSpatialQueryProfilingSnapshot(): GeometrySpatialQueryProfilingSnapshot | null {
		const session = this.spatialQueryProfilingSession
		if (!session) return null

		const elapsedMs = Math.max(0, now() - session.startedAt)
		const sources: Record<string, GeometrySpatialQuerySourceSnapshot> = {}
		session.sources.forEach((source, sourceName) => {
			sources[sourceName] = {
				queryCount: source.queryCount,
				indexedQueryCount: source.indexedQueryCount,
				directScanQueryCount: source.directScanQueryCount,
				totalDurationMs: roundMetric(source.totalDurationMs),
				averageDurationMs: roundMetric(source.totalDurationMs / source.queryCount),
				maxDurationMs: roundMetric(source.maxDurationMs),
				totalCandidateCount: source.totalCandidateCount,
				averageCandidateCount: roundMetric(source.totalCandidateCount / source.queryCount),
				totalResultCount: source.totalResultCount,
				averageResultCount: roundMetric(source.totalResultCount / source.queryCount),
				filterQueryCount: source.filterQueryCount,
				totalFilterElementCount: source.totalFilterElementCount,
				averageFilterElementCount: roundMetric(
					source.totalFilterElementCount / source.queryCount,
				),
				copiedFilterQueryCount: source.copiedFilterQueryCount,
				copiedFilterElementCount: source.copiedFilterElementCount,
				totalVisitedCellCount: source.totalVisitedCellCount,
				averageVisitedCellCount: roundMetric(
					source.totalVisitedCellCount / source.queryCount,
				),
			}
		})

		return {
			elapsedMs: roundMetric(elapsedMs),
			queryCount: session.queryCount,
			queriesPerSecond: roundMetric(
				elapsedMs > 0 ? (session.queryCount * 1000) / elapsedMs : 0,
			),
			indexedQueryCount: session.indexedQueryCount,
			directScanQueryCount: session.directScanQueryCount,
			totalDurationMs: roundMetric(session.totalDurationMs),
			averageDurationMs: roundMetric(
				session.queryCount > 0 ? session.totalDurationMs / session.queryCount : 0,
			),
			maxDurationMs: roundMetric(session.maxDurationMs),
			filterQueryCount: session.filterQueryCount,
			totalFilterElementCount: session.totalFilterElementCount,
			copiedFilterQueryCount: session.copiedFilterQueryCount,
			copiedFilterElementCount: session.copiedFilterElementCount,
			totalVisitedCellCount: session.totalVisitedCellCount,
			totalEstimatedCellCount: session.totalEstimatedCellCount,
			totalCandidateCount: session.totalCandidateCount,
			totalResultCount: session.totalResultCount,
			spatialIndexBuildCount: session.spatialIndexBuildCount,
			totalSpatialIndexBuildDurationMs: roundMetric(session.totalSpatialIndexBuildDurationMs),
			maxSpatialIndexBuildDurationMs: roundMetric(session.maxSpatialIndexBuildDurationMs),
			lastSpatialIndexBuildElementCount: session.lastSpatialIndexBuildElementCount,
			sources,
		}
	}

	public stopSpatialQueryProfiling(): GeometrySpatialQueryProfilingSnapshot | null {
		const snapshot = this.getSpatialQueryProfilingSnapshot()
		this.spatialQueryProfilingSession = null
		return snapshot
	}

	private getSpatialPerfActivityCounters(): CanvasSpatialPerfActivityCounters {
		const visibility = this.canvas.visibilityManager?.getSnapshot?.()
		const runtime = this.canvas.runtimeScheduler?.getSnapshot?.()
		const drawLayerRequestCounts: Record<string, number> = {}
		const drawLayerDrawnCounts: Record<string, number> = {}
		if (runtime?.layers) {
			Object.entries(runtime.layers).forEach(([layerName, layer]) => {
				drawLayerRequestCounts[layerName] = layer.requestedCount
				drawLayerDrawnCounts[layerName] = layer.drawnCount
			})
		}
		return {
			visibilityRefreshCount: visibility?.queryCount ?? 0,
			visibilitySkippedRefreshCount: visibility?.skippedViewportQueryCount ?? 0,
			drawRequestCount: runtime?.drawRequestCount ?? 0,
			drawnCount: runtime?.drawnCount ?? 0,
			drawFlushCount: runtime?.flushCount ?? 0,
			drawCoalescedRequestCount: runtime?.coalescedDrawRequestCount ?? 0,
			drawSkippedByStageCount: runtime?.skippedByStageDrawCount ?? 0,
			lastDrawFlushDurationMs: runtime?.lastFlushDurationMs ?? 0,
			drawReasonCounts: runtime?.drawReasonCounts ?? {},
			drawLayerRequestCounts,
			drawLayerDrawnCounts,
			viewportScaleDispatchCount: runtime?.viewportScaleLayouts.dispatchCount ?? 0,
			viewportScaleCallbackCount: runtime?.viewportScaleLayouts.totalCallbackCount ?? 0,
			viewportScaleActivationCallbackCount:
				runtime?.viewportScaleLayouts.activationCallbackCount ?? 0,
			lastVisibilityRefreshDurationMs: visibility?.lastQueryDurationMs ?? 0,
			registeredMediaCount:
				(visibility?.registeredImageCount ?? 0) +
				(visibility?.registeredVideoCount ?? 0) +
				(visibility?.registeredAudioCount ?? 0),
			visibleMediaCount:
				(visibility?.visibleImageCount ?? 0) +
				(visibility?.visibleVideoCount ?? 0) +
				(visibility?.visibleAudioCount ?? 0),
			nearMediaCount:
				(visibility?.nearImageCount ?? 0) +
				(visibility?.nearVideoCount ?? 0) +
				(visibility?.nearAudioCount ?? 0),
			registeredViewportScaleLayoutElementCount:
				runtime?.viewportScaleLayouts.registeredElementCount ?? 0,
			registeredViewportScaleLayoutCallbackCount:
				runtime?.viewportScaleLayouts.registeredCallbackCount ?? 0,
			activeViewportScaleLayoutElementCount:
				runtime?.viewportScaleLayouts.activeElementCount ?? 0,
			lastViewportScaleLayoutVisitedElementCount:
				runtime?.viewportScaleLayouts.lastVisitedElementCount ?? 0,
			lastViewportScaleLayoutCallbackCount:
				runtime?.viewportScaleLayouts.lastCallbackCount ?? 0,
		}
	}

	public getElementBounds(elementId: string): Rect | null {
		if (this.elementBoundsCache.has(elementId)) {
			return cloneRect(this.elementBoundsCache.get(elementId) ?? null)
		}

		const element = this.canvas.elementManager.getElementInstance(elementId)
		const bounds = element?.getBoundingRect() ?? null
		this.elementBoundsCache.set(elementId, bounds ? { ...bounds } : null)
		return cloneRect(bounds)
	}

	public getElementsBounds(elementIds: string[]): Rect | null {
		if (elementIds.length === 0) {
			return null
		}

		const rects: Rect[] = []
		for (const elementId of elementIds) {
			const rect = this.getElementBounds(elementId)
			if (rect) {
				rects.push(rect)
			}
		}

		return mergeRects(rects)
	}

	public getAllElementsBounds(): Rect | null {
		if (this.allElementsBoundsCache !== undefined) {
			return cloneRect(this.allElementsBoundsCache)
		}

		const visibleIds = this.canvas.elementManager
			.getAllElementIds()
			.filter((id) => this.canvas.elementManager.isElementVisibleInDataTree(id))
		const rect = this.getElementsBounds(visibleIds)
		this.allElementsBoundsCache = rect ? { ...rect } : null
		return cloneRect(rect)
	}

	public filterElementsByExpandedRect<T extends Pick<LayerElement, "id">>(
		elements: T[],
		rect: Rect,
		padding: number,
	): T[] {
		if (elements.length === 0) {
			return elements
		}

		const queryRect = expandRect(rect, padding)
		return elements.filter((element) => {
			const bounds = this.getElementBounds(element.id)
			return !!bounds && intersectsRect(bounds, queryRect)
		})
	}

	public queryElementIdsByExpandedRect(
		rect: Rect,
		padding: number,
		options?: GeometrySpatialQueryOptions,
	): string[] {
		const profilingSession = this.spatialQueryProfilingSession
		const queryStartedAt = profilingSession ? now() : 0
		const queryRect = expandRect(rect, padding)
		const candidateElementIds = options?.elementIds
		const existingSetFilter = candidateElementIds instanceof Set ? candidateElementIds : null
		const copiedFilter = Boolean(profilingSession && candidateElementIds && !existingSetFilter)
		const allowedIds: ReadonlySet<string> | null = candidateElementIds
			? (existingSetFilter ?? new Set(candidateElementIds))
			: null
		const estimatedCellCount = this.getCellCountForRect(queryRect)

		if (allowedIds && this.shouldDirectScanAllowedIds(allowedIds, estimatedCellCount)) {
			const result = this.queryAllowedIdsByRect(allowedIds, queryRect)
			if (profilingSession) {
				this.recordSpatialQuery(profilingSession, {
					source: options?.debugSource ?? "unspecified",
					mode: "direct-scan",
					durationMs: now() - queryStartedAt,
					filterSize: allowedIds.size,
					hasFilter: true,
					copiedFilter,
					estimatedCellCount,
					visitedCellCount: 0,
					candidateCount: allowedIds.size,
					resultCount: result.length,
				})
			}
			return result
		}

		this.ensureSpatialIndex()

		const candidateIds = new Set<string>()
		const cellKeys = this.getCellKeysForRect(queryRect)
		for (const cellKey of cellKeys) {
			const cell = this.spatialIndex.get(cellKey)
			if (!cell) continue
			cell.forEach((elementId) => {
				if (!allowedIds || allowedIds.has(elementId)) {
					candidateIds.add(elementId)
				}
			})
		}

		const result: string[] = []
		candidateIds.forEach((elementId) => {
			const bounds = this.getElementBounds(elementId)
			if (bounds && intersectsRect(bounds, queryRect)) {
				result.push(elementId)
			}
		})
		if (profilingSession) {
			this.recordSpatialQuery(profilingSession, {
				source: options?.debugSource ?? "unspecified",
				mode: "indexed",
				durationMs: now() - queryStartedAt,
				filterSize: allowedIds?.size ?? 0,
				hasFilter: allowedIds !== null,
				copiedFilter,
				estimatedCellCount,
				visitedCellCount: cellKeys.length,
				candidateCount: candidateIds.size,
				resultCount: result.length,
			})
		}
		return result
	}

	public containsRect(outer: Rect, inner: Rect): boolean {
		return containsRect(outer, inner)
	}

	public invalidateElement(elementId: string): void {
		this.invalidateElementInternal(elementId)
	}

	public invalidateElements(elementIds: ReadonlySet<string> | readonly string[]): void {
		let hasInvalidated = false
		elementIds.forEach((elementId) => {
			this.invalidateElementInternal(elementId)
			hasInvalidated = true
		})
		if (hasInvalidated) {
			this.allElementsBoundsCache = undefined
		}
	}

	public invalidateAll(): void {
		this.elementBoundsCache.clear()
		this.allElementsBoundsCache = undefined
		this.spatialIndex.clear()
		this.elementSpatialCells.clear()
		this.spatialIndexDirty = true
	}

	public destroy(): void {
		this.unregisterSpatialPerfDebug()
		this.unregisterSpatialPerfDebug = () => undefined
		this.spatialQueryProfilingSession = null
		this.invalidateAll()
	}

	private recordSpatialQuery(
		session: MutableGeometrySpatialQueryProfilingSession,
		sample: GeometrySpatialQuerySample,
	): void {
		session.queryCount += 1
		session.totalDurationMs += sample.durationMs
		session.maxDurationMs = Math.max(session.maxDurationMs, sample.durationMs)
		if (sample.mode === "indexed") session.indexedQueryCount += 1
		else session.directScanQueryCount += 1
		if (sample.hasFilter) {
			session.filterQueryCount += 1
			session.totalFilterElementCount += sample.filterSize
		}
		if (sample.copiedFilter) {
			session.copiedFilterQueryCount += 1
			session.copiedFilterElementCount += sample.filterSize
		}
		session.totalVisitedCellCount += sample.visitedCellCount
		session.totalEstimatedCellCount += sample.estimatedCellCount
		session.totalCandidateCount += sample.candidateCount
		session.totalResultCount += sample.resultCount

		let source = session.sources.get(sample.source)
		if (!source) {
			source = {
				queryCount: 0,
				indexedQueryCount: 0,
				directScanQueryCount: 0,
				totalDurationMs: 0,
				maxDurationMs: 0,
				totalCandidateCount: 0,
				totalResultCount: 0,
				filterQueryCount: 0,
				totalFilterElementCount: 0,
				copiedFilterQueryCount: 0,
				copiedFilterElementCount: 0,
				totalVisitedCellCount: 0,
			}
			session.sources.set(sample.source, source)
		}
		source.queryCount += 1
		source.totalDurationMs += sample.durationMs
		source.maxDurationMs = Math.max(source.maxDurationMs, sample.durationMs)
		if (sample.mode === "indexed") source.indexedQueryCount += 1
		else source.directScanQueryCount += 1
		source.totalCandidateCount += sample.candidateCount
		source.totalResultCount += sample.resultCount
		if (sample.hasFilter) {
			source.filterQueryCount += 1
			source.totalFilterElementCount += sample.filterSize
		}
		if (sample.copiedFilter) {
			source.copiedFilterQueryCount += 1
			source.copiedFilterElementCount += sample.filterSize
		}
		source.totalVisitedCellCount += sample.visitedCellCount
	}

	private invalidateElementInternal(elementId: string): void {
		this.removeElementFromSpatialIndex(elementId)
		this.elementBoundsCache.delete(elementId)
		this.allElementsBoundsCache = undefined

		if (!this.spatialIndexDirty) {
			this.addElementToSpatialIndex(elementId)
		}
	}

	private removeElementFromSpatialIndex(elementId: string): void {
		const cellKeys = this.elementSpatialCells.get(elementId)
		if (!cellKeys) return

		for (const cellKey of cellKeys) {
			const cell = this.spatialIndex.get(cellKey)
			if (!cell) continue
			cell.delete(elementId)
			if (cell.size === 0) {
				this.spatialIndex.delete(cellKey)
			}
		}
		this.elementSpatialCells.delete(elementId)
	}

	private addElementToSpatialIndex(elementId: string): void {
		if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return

		const bounds = this.getElementBounds(elementId)
		if (!bounds) return

		const cellKeys = this.getCellKeysForRect(bounds)
		this.elementSpatialCells.set(elementId, cellKeys)
		for (const cellKey of cellKeys) {
			let cell = this.spatialIndex.get(cellKey)
			if (!cell) {
				cell = new Set<string>()
				this.spatialIndex.set(cellKey, cell)
			}
			cell.add(elementId)
		}
	}

	private ensureSpatialIndex(): void {
		if (!this.spatialIndexDirty) return
		const profilingSession = this.spatialQueryProfilingSession
		const buildStartedAt = profilingSession ? now() : 0

		this.spatialIndex.clear()
		this.elementSpatialCells.clear()

		const elementIds = this.canvas.elementManager.getAllElementIds()
		for (const elementId of elementIds) {
			this.addElementToSpatialIndex(elementId)
		}

		this.spatialIndexDirty = false
		if (profilingSession) {
			const durationMs = now() - buildStartedAt
			profilingSession.spatialIndexBuildCount += 1
			profilingSession.totalSpatialIndexBuildDurationMs += durationMs
			profilingSession.maxSpatialIndexBuildDurationMs = Math.max(
				profilingSession.maxSpatialIndexBuildDurationMs,
				durationMs,
			)
			profilingSession.lastSpatialIndexBuildElementCount = elementIds.length
		}
	}

	private shouldDirectScanAllowedIds(
		allowedIds: ReadonlySet<string>,
		cellCount: number,
	): boolean {
		if (allowedIds.size === 0) return true
		return cellCount > allowedIds.size * DIRECT_SCAN_CELL_TO_ALLOWED_RATIO
	}

	private queryAllowedIdsByRect(allowedIds: ReadonlySet<string>, queryRect: Rect): string[] {
		const result: string[] = []
		allowedIds.forEach((elementId) => {
			if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return
			const bounds = this.getElementBounds(elementId)
			if (bounds && intersectsRect(bounds, queryRect)) {
				result.push(elementId)
			}
		})
		return result
	}

	private getCellCountForRect(rect: Rect): number {
		const minCellX = Math.floor(rect.x / this.spatialCellSize)
		const minCellY = Math.floor(rect.y / this.spatialCellSize)
		const maxCellX = Math.floor((rect.x + rect.width) / this.spatialCellSize)
		const maxCellY = Math.floor((rect.y + rect.height) / this.spatialCellSize)
		return (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1)
	}

	private getCellKeysForRect(rect: Rect): string[] {
		const minCellX = Math.floor(rect.x / this.spatialCellSize)
		const minCellY = Math.floor(rect.y / this.spatialCellSize)
		const maxCellX = Math.floor((rect.x + rect.width) / this.spatialCellSize)
		const maxCellY = Math.floor((rect.y + rect.height) / this.spatialCellSize)
		const keys: string[] = []

		for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
			for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
				keys.push(`${cellX}:${cellY}`)
			}
		}

		return keys
	}
}
