import type { Rect } from "../../shared/geometry/nodeTransform"

/** 将 outer 减去与 cutout 的交集，返回至多四块互不重叠的矩形。 */
export function getRectDifferenceSegments(outer: Rect, cutout: Rect): Rect[] {
	if (outer.width <= 0 || outer.height <= 0) return []

	const outerRight = outer.x + outer.width
	const outerBottom = outer.y + outer.height
	const intersectionLeft = Math.max(outer.x, cutout.x)
	const intersectionTop = Math.max(outer.y, cutout.y)
	const intersectionRight = Math.min(outerRight, cutout.x + cutout.width)
	const intersectionBottom = Math.min(outerBottom, cutout.y + cutout.height)

	if (intersectionLeft >= intersectionRight || intersectionTop >= intersectionBottom) {
		return [{ ...outer }]
	}

	return [
		{
			x: outer.x,
			y: outer.y,
			width: outer.width,
			height: intersectionTop - outer.y,
		},
		{
			x: outer.x,
			y: intersectionBottom,
			width: outer.width,
			height: outerBottom - intersectionBottom,
		},
		{
			x: outer.x,
			y: intersectionTop,
			width: intersectionLeft - outer.x,
			height: intersectionBottom - intersectionTop,
		},
		{
			x: intersectionRight,
			y: intersectionTop,
			width: outerRight - intersectionRight,
			height: intersectionBottom - intersectionTop,
		},
	].filter((rect) => rect.width > 0 && rect.height > 0)
}
