import type { Canvas } from "../../core/Canvas"
import type { CanvasConnection } from "../../document/types"
import type { Rect } from "../../shared/ids"
import {
	doesConnectionGeometryIntersectRect,
	type ResolvedConnectionGeometry,
	resolveConnectionGeometry,
} from "./connectionGeometry"
import { CONNECTION_BOX_SELECTION_STYLE } from "./connectionStyle"

interface ConnectionGeometryCacheRecord {
	connectionId: string
	sourceElementId: string
	targetElementId: string
	geometry: ResolvedConnectionGeometry
	roughBounds: Rect
}

function normalizeRect(rect: Rect): Rect {
	const minX = Math.min(rect.x, rect.x + rect.width)
	const maxX = Math.max(rect.x, rect.x + rect.width)
	const minY = Math.min(rect.y, rect.y + rect.height)
	const maxY = Math.max(rect.y, rect.y + rect.height)

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

function rectsIntersect(a: Rect, b: Rect): boolean {
	return (
		a.x <= b.x + b.width &&
		a.x + a.width >= b.x &&
		a.y <= b.y + b.height &&
		a.y + a.height >= b.y
	)
}

function getGeometryRoughBounds(geometry: ResolvedConnectionGeometry): Rect {
	const [x0, y0, x1, y1, x2, y2, x3, y3] = geometry.points
	const minX = Math.min(x0, x1, x2, x3)
	const maxX = Math.max(x0, x1, x2, x3)
	const minY = Math.min(y0, y1, y2, y3)
	const maxY = Math.max(y0, y1, y2, y3)

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

export class ConnectionHitTestService {
	private readonly canvas: Canvas
	private geometryCache = new Map<string, ConnectionGeometryCacheRecord>()

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public findConnectionsInBox(connections: CanvasConnection[], box: Rect): string[] {
		const scale = this.getSafeStageScale()
		const padding = CONNECTION_BOX_SELECTION_STYLE.hitPaddingPx / scale
		const normalizedBox = normalizeRect(box)
		const matchedConnectionIds: string[] = []

		for (const connection of connections) {
			const record = this.getGeometryRecord(connection)
			if (!record) continue

			if (!rectsIntersect(expandRect(record.roughBounds, padding), normalizedBox)) {
				continue
			}

			if (doesConnectionGeometryIntersectRect(record.geometry, box, { padding })) {
				matchedConnectionIds.push(connection.id)
			}
		}

		return matchedConnectionIds
	}

	public invalidateAll(): void {
		this.geometryCache.clear()
	}

	public invalidateConnections(connectionIds: Iterable<string>): void {
		for (const connectionId of connectionIds) {
			this.geometryCache.delete(connectionId)
		}
	}

	public invalidateElements(elementIds: Iterable<string>): void {
		const elementIdSet = new Set(elementIds)
		if (elementIdSet.size === 0) return

		this.geometryCache.forEach((record, connectionId) => {
			if (
				elementIdSet.has(record.sourceElementId) ||
				elementIdSet.has(record.targetElementId)
			) {
				this.geometryCache.delete(connectionId)
			}
		})
	}

	private getGeometryRecord(connection: CanvasConnection): ConnectionGeometryCacheRecord | null {
		const cachedRecord = this.geometryCache.get(connection.id)
		if (
			cachedRecord &&
			cachedRecord.sourceElementId === connection.sourceElementId &&
			cachedRecord.targetElementId === connection.targetElementId
		) {
			return cachedRecord
		}

		const sourceRect = this.canvas.geometryCacheManager.getElementBounds(
			connection.sourceElementId,
		)
		const targetRect = this.canvas.geometryCacheManager.getElementBounds(
			connection.targetElementId,
		)
		const geometry = resolveConnectionGeometry(sourceRect, targetRect)
		if (!geometry) {
			this.geometryCache.delete(connection.id)
			return null
		}

		const record = {
			connectionId: connection.id,
			sourceElementId: connection.sourceElementId,
			targetElementId: connection.targetElementId,
			geometry,
			roughBounds: getGeometryRoughBounds(geometry),
		}
		this.geometryCache.set(connection.id, record)
		return record
	}

	private getSafeStageScale(): number {
		const scale = this.canvas.stage.scaleX()
		return Number.isFinite(scale) && scale > 0 ? scale : 1
	}
}
