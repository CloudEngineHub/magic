import type { CustGeomPoint } from "../../ir/node"
import { pxToInch } from "../../shared/unit"

/**
 * Parse CSS clip-path: polygon(...) into custGeom path points
 * Convert percentage and pixel coordinates to inches relative to the shape width/height
 */
export function parseClipPathPolygon(
	clipPath: string,
	wInch: number,
	hInch: number,
): CustGeomPoint[] | null {
	if (!clipPath || clipPath === "none") return null

	const match = clipPath.match(/polygon\((.+)\)/)
	if (!match) return null

	const pairs = match[1].split(",").map((p) => p.trim())
	if (pairs.length < 3) return null

	const points: CustGeomPoint[] = []

	for (let i = 0; i < pairs.length; i++) {
		const parts = pairs[i].split(/\s+/)
		if (parts.length !== 2) return null

		const x = resolveClipCoord(parts[0], wInch)
		const y = resolveClipCoord(parts[1], hInch)
		if (x === null || y === null) return null

		if (i === 0) {
			points.push({ x, y, moveTo: true })
		} else {
			points.push({ x, y })
		}
	}

	points.push({ close: true })
	return points
}

function resolveClipCoord(value: string, dimensionInch: number): number | null {
	value = value.trim()
	if (value.endsWith("%")) {
		const percent = parseFloat(value)
		if (isNaN(percent)) return null
		return (percent / 100) * dimensionInch
	}
	if (value.endsWith("px")) {
		const px = parseFloat(value)
		if (isNaN(px)) return null
		return pxToInch(px)
	}
	const num = parseFloat(value)
	if (isNaN(num)) return null
	return pxToInch(num)
}
