import type { Canvas } from "../../core/Canvas"
import type { LayerElement } from "../../document/types"
import type { Rect } from "../ids"

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

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
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
		options?: { elementIds?: Iterable<string> },
	): string[] {
		const queryRect = expandRect(rect, padding)
		const allowedIds = options?.elementIds ? new Set(options.elementIds) : null
		const estimatedCellCount = this.getCellCountForRect(queryRect)

		if (allowedIds && this.shouldDirectScanAllowedIds(allowedIds, estimatedCellCount)) {
			return this.queryAllowedIdsByRect(allowedIds, queryRect)
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
		this.invalidateAll()
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

		this.spatialIndex.clear()
		this.elementSpatialCells.clear()

		for (const elementId of this.canvas.elementManager.getAllElementIds()) {
			this.addElementToSpatialIndex(elementId)
		}

		this.spatialIndexDirty = false
	}

	private shouldDirectScanAllowedIds(allowedIds: Set<string>, cellCount: number): boolean {
		if (allowedIds.size === 0) return true
		return cellCount > allowedIds.size * DIRECT_SCAN_CELL_TO_ALLOWED_RATIO
	}

	private queryAllowedIdsByRect(allowedIds: Set<string>, queryRect: Rect): string[] {
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
