import type { Rect } from "../../shared/ids"
import { CONNECTION_CURVE_STYLE } from "./connectionStyle"

export type ConnectionSide = "left" | "right"

export interface ConnectionPoint {
	x: number
	y: number
}

export interface ResolvedConnectionGeometry {
	sourceSide: ConnectionSide
	targetSide: ConnectionSide
	start: ConnectionPoint
	end: ConnectionPoint
	points: number[]
	pathData: string
}

interface ConnectionHitRect {
	x: number
	y: number
	width: number
	height: number
}

export function resolveConnectionControlOffset(horizontalDistance: number): number {
	const distance = Math.max(0, horizontalDistance)
	return Math.max(
		distance * CONNECTION_CURVE_STYLE.controlOffsetRatio,
		CONNECTION_CURVE_STYLE.controlOffsetMin,
	)
}

function isValidRect(rect: Rect | null): rect is Rect {
	return (
		!!rect &&
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height) &&
		rect.width > 0 &&
		rect.height > 0
	)
}

function getEdgePoint(rect: Rect, side: ConnectionSide): ConnectionPoint {
	return {
		x: side === "right" ? rect.x + rect.width : rect.x,
		y: rect.y + rect.height / 2,
	}
}

export function resolveConnectionGeometry(
	sourceRect: Rect | null,
	targetRect: Rect | null,
): ResolvedConnectionGeometry | null {
	if (!isValidRect(sourceRect) || !isValidRect(targetRect)) {
		return null
	}

	const sourceSide: ConnectionSide = "right"
	const targetSide: ConnectionSide = "left"
	const start = getEdgePoint(sourceRect, sourceSide)
	const end = getEdgePoint(targetRect, targetSide)
	const horizontalDistance = Math.abs(end.x - start.x)
	const controlOffset = resolveConnectionControlOffset(horizontalDistance)
	const controlPoint1 = {
		x: start.x + controlOffset,
		y: start.y,
	}
	const controlPoint2 = {
		x: end.x - controlOffset,
		y: end.y,
	}
	const points = [
		start.x,
		start.y,
		controlPoint1.x,
		controlPoint1.y,
		controlPoint2.x,
		controlPoint2.y,
		end.x,
		end.y,
	]

	return {
		sourceSide,
		targetSide,
		start,
		end,
		points,
		pathData: `M ${start.x} ${start.y} C ${controlPoint1.x} ${controlPoint1.y} ${controlPoint2.x} ${controlPoint2.y} ${end.x} ${end.y}`,
	}
}

function normalizeRect(rect: ConnectionHitRect, padding = 0): ConnectionHitRect {
	const minX = Math.min(rect.x, rect.x + rect.width) - padding
	const maxX = Math.max(rect.x, rect.x + rect.width) + padding
	const minY = Math.min(rect.y, rect.y + rect.height) - padding
	const maxY = Math.max(rect.y, rect.y + rect.height) + padding

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

function getPointBounds(points: ConnectionPoint[]): ConnectionHitRect {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const point of points) {
		minX = Math.min(minX, point.x)
		minY = Math.min(minY, point.y)
		maxX = Math.max(maxX, point.x)
		maxY = Math.max(maxY, point.y)
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

function rectsIntersect(a: ConnectionHitRect, b: ConnectionHitRect): boolean {
	return (
		a.x <= b.x + b.width &&
		a.x + a.width >= b.x &&
		a.y <= b.y + b.height &&
		a.y + a.height >= b.y
	)
}

function containsPoint(rect: ConnectionHitRect, point: ConnectionPoint): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.width &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.height
	)
}

function getCubicPoint(points: number[], t: number): ConnectionPoint {
	const [x0, y0, x1, y1, x2, y2, x3, y3] = points
	const mt = 1 - t
	const mt2 = mt * mt
	const t2 = t * t

	return {
		x: mt2 * mt * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t2 * t * x3,
		y: mt2 * mt * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t2 * t * y3,
	}
}

export function getConnectionGeometryPointAt(
	geometry: ResolvedConnectionGeometry,
	t: number,
): ConnectionPoint {
	const normalizedT = Math.min(Math.max(t, 0), 1)
	return getCubicPoint(geometry.points, normalizedT)
}

function getOrientation(a: ConnectionPoint, b: ConnectionPoint, c: ConnectionPoint): number {
	const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
	if (Math.abs(value) < Number.EPSILON) return 0
	return value > 0 ? 1 : 2
}

function isPointOnSegment(a: ConnectionPoint, b: ConnectionPoint, c: ConnectionPoint): boolean {
	return (
		b.x <= Math.max(a.x, c.x) &&
		b.x >= Math.min(a.x, c.x) &&
		b.y <= Math.max(a.y, c.y) &&
		b.y >= Math.min(a.y, c.y)
	)
}

function segmentsIntersect(
	a: ConnectionPoint,
	b: ConnectionPoint,
	c: ConnectionPoint,
	d: ConnectionPoint,
): boolean {
	const o1 = getOrientation(a, b, c)
	const o2 = getOrientation(a, b, d)
	const o3 = getOrientation(c, d, a)
	const o4 = getOrientation(c, d, b)

	if (o1 !== o2 && o3 !== o4) return true
	if (o1 === 0 && isPointOnSegment(a, c, b)) return true
	if (o2 === 0 && isPointOnSegment(a, d, b)) return true
	if (o3 === 0 && isPointOnSegment(c, a, d)) return true
	if (o4 === 0 && isPointOnSegment(c, b, d)) return true
	return false
}

function segmentIntersectsRect(
	start: ConnectionPoint,
	end: ConnectionPoint,
	rect: ConnectionHitRect,
): boolean {
	if (containsPoint(rect, start) || containsPoint(rect, end)) {
		return true
	}

	const topLeft = { x: rect.x, y: rect.y }
	const topRight = { x: rect.x + rect.width, y: rect.y }
	const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height }
	const bottomLeft = { x: rect.x, y: rect.y + rect.height }

	return (
		segmentsIntersect(start, end, topLeft, topRight) ||
		segmentsIntersect(start, end, topRight, bottomRight) ||
		segmentsIntersect(start, end, bottomRight, bottomLeft) ||
		segmentsIntersect(start, end, bottomLeft, topLeft)
	)
}

export function doesConnectionGeometryIntersectRect(
	geometry: ResolvedConnectionGeometry,
	rect: ConnectionHitRect,
	options?: { padding?: number; samples?: number },
): boolean {
	const padding = Math.max(0, options?.padding ?? 0)
	const samples = Math.max(4, Math.floor(options?.samples ?? 32))
	const hitRect = normalizeRect(rect, padding)
	if (hitRect.width <= 0 && hitRect.height <= 0) {
		return false
	}

	const [x0, y0, x1, y1, x2, y2, x3, y3] = geometry.points
	const controlBounds = getPointBounds([
		{ x: x0, y: y0 },
		{ x: x1, y: y1 },
		{ x: x2, y: y2 },
		{ x: x3, y: y3 },
	])
	if (!rectsIntersect(normalizeRect(controlBounds), hitRect)) {
		return false
	}

	let previousPoint = geometry.start
	for (let index = 1; index <= samples; index += 1) {
		const point = getCubicPoint(geometry.points, index / samples)
		if (segmentIntersectsRect(previousPoint, point, hitRect)) {
			return true
		}
		previousPoint = point
	}

	return false
}
