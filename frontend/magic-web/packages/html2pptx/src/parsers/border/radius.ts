import type { CustGeomPoint } from "../../ir/node"
import { pxToInch } from "../../shared/unit"

export type Side = "top" | "right" | "bottom" | "left"

export interface CornerRadii {
	tl: number
	tr: number
	br: number
	bl: number
}

export interface AdjacentInfo {
	start: boolean
	end: boolean
}

export function getAdjacentSides(side: Side, visible: Set<Side>): AdjacentInfo {
	switch (side) {
		case "left": return { start: visible.has("top"), end: visible.has("bottom") }
		case "top": return { start: visible.has("left"), end: visible.has("right") }
		case "right": return { start: visible.has("top"), end: visible.has("bottom") }
		case "bottom": return { start: visible.has("left"), end: visible.has("right") }
	}
}

export function parseFourCornerRadii(borderRadius: string, w: number, h: number): CornerRadii {
	if (!borderRadius || borderRadius === "0px") return { tl: 0, tr: 0, br: 0, bl: 0 }

	const values = borderRadius.split(" ").map((v) => {
		if (v.endsWith("%")) {
			return (parseFloat(v) / 100) * Math.min(w, h)
		}
		return parseFloat(v) || 0
	})

	let tl: number, tr: number, br: number, bl: number
	switch (values.length) {
		case 1:
			tl = tr = br = bl = values[0]
			break
		case 2:
			tl = br = values[0]
			tr = bl = values[1]
			break
		case 3:
			tl = values[0]
			tr = bl = values[1]
			br = values[2]
			break
		default:
			tl = values[0]
			tr = values[1]
			br = values[2]
			bl = values[3]
			break
	}

	const maxR = Math.min(w, h) / 2
	tl = Math.min(tl, maxR)
	tr = Math.min(tr, maxR)
	br = Math.min(br, maxR)
	bl = Math.min(bl, maxR)

	return { tl, tr, br, bl }
}

export interface BorderWidths {
	top: number
	right: number
	bottom: number
	left: number
}

type Pt = [number, number]

const ARC_SEGMENTS = 18

/** Near (smallest positive t) intersection of the ray O+t*dir with a circle. */
function rayCircleNear(O: Pt, dir: Pt, C: Pt, R: number): Pt {
	if (R <= 0) return [O[0], O[1]]
	const fx = O[0] - C[0]
	const fy = O[1] - C[1]
	const a = dir[0] * dir[0] + dir[1] * dir[1]
	const b = 2 * (fx * dir[0] + fy * dir[1])
	const c = fx * fx + fy * fy - R * R
	const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c))
	const t1 = (-b - disc) / (2 * a)
	const t2 = (-b + disc) / (2 * a)
	const positives = [t1, t2].filter((t) => t > -1e-9).sort((p, q) => p - q)
	const t = positives.length ? positives[0] : t1
	return [O[0] + t * dir[0], O[1] + t * dir[1]]
}

/** Near (smallest positive t) intersection of the ray O+t*dir with an ellipse centered at C. */
function rayEllipseNear(O: Pt, dir: Pt, C: Pt, rx: number, ry: number): Pt {
	if (rx <= 0 || ry <= 0) return [C[0], C[1]]
	const Ox = (O[0] - C[0]) / rx
	const Oy = (O[1] - C[1]) / ry
	const Dx = dir[0] / rx
	const Dy = dir[1] / ry
	const a = Dx * Dx + Dy * Dy
	const b = 2 * (Ox * Dx + Oy * Dy)
	const c = Ox * Ox + Oy * Oy - 1
	const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c))
	const t1 = (-b - disc) / (2 * a)
	const t2 = (-b + disc) / (2 * a)
	const positives = [t1, t2].filter((t) => t > -1e-9).sort((p, q) => p - q)
	const t = positives.length ? positives[0] : Math.min(t1, t2)
	return [O[0] + t * dir[0], O[1] + t * dir[1]]
}

/** Sample a circular arc from P1 to P2 (the short way) as a list of points. */
function sampleCircleArc(C: Pt, R: number, P1: Pt, P2: Pt): Pt[] {
	if (R <= 1e-9) return [P1, P2]
	const a1 = Math.atan2(P1[1] - C[1], P1[0] - C[0])
	const a2 = Math.atan2(P2[1] - C[1], P2[0] - C[0])
	let d = a2 - a1
	while (d > Math.PI) d -= 2 * Math.PI
	while (d < -Math.PI) d += 2 * Math.PI
	const pts: Pt[] = []
	for (let i = 0; i <= ARC_SEGMENTS; i++) {
		const a = a1 + (d * i) / ARC_SEGMENTS
		pts.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)])
	}
	return pts
}

/** Sample an elliptical arc from P1 to P2 (the short way) as a list of points. */
function sampleEllipseArc(C: Pt, rx: number, ry: number, P1: Pt, P2: Pt): Pt[] {
	if (rx <= 1e-9 || ry <= 1e-9) return [P1, P2]
	const a1 = Math.atan2((P1[1] - C[1]) / ry, (P1[0] - C[0]) / rx)
	const a2 = Math.atan2((P2[1] - C[1]) / ry, (P2[0] - C[0]) / rx)
	let d = a2 - a1
	while (d > Math.PI) d -= 2 * Math.PI
	while (d < -Math.PI) d += 2 * Math.PI
	const pts: Pt[] = []
	for (let i = 0; i <= ARC_SEGMENTS; i++) {
		const a = a1 + (d * i) / ARC_SEGMENTS
		pts.push([C[0] + rx * Math.cos(a), C[1] + ry * Math.sin(a)])
	}
	return pts
}

interface Corner {
	O: Pt
	C: Pt
	R: number
	I: Pt
	rx: number
	ry: number
}

function cornerMiter(cn: Corner): { outer: Pt; inner: Pt } {
	const dir: Pt = [cn.I[0] - cn.O[0], cn.I[1] - cn.O[1]]
	return {
		outer: rayCircleNear(cn.O, dir, cn.C, cn.R),
		inner: rayEllipseNear(cn.O, dir, cn.C, cn.rx, cn.ry),
	}
}

interface SideConfig {
	startCorner: Corner
	endCorner: Corner
	outStart: Pt
	inStart: Pt
	outEnd: Pt
	inEnd: Pt
	fullStartOuter: Pt
	fullStartInner: Pt
	fullEndOuter: Pt
	fullEndInner: Pt
}

function tracePoints(cfg: SideConfig, adj: AdjacentInfo): Pt[] {
	const pts: Pt[] = []
	const push = (arr: Pt[]) => {
		for (const p of arr) pts.push(p)
	}

	// Start corner: outer arc, miter line, inner arc.
	if (adj.start) {
		const m = cornerMiter(cfg.startCorner)
		push(sampleCircleArc(cfg.startCorner.C, cfg.startCorner.R, cfg.outStart, m.outer))
		pts.push(m.inner)
		push(sampleEllipseArc(cfg.startCorner.C, cfg.startCorner.rx, cfg.startCorner.ry, m.inner, cfg.inStart))
	} else {
		push(sampleCircleArc(cfg.startCorner.C, cfg.startCorner.R, cfg.outStart, cfg.fullStartOuter))
		pts.push(cfg.fullStartInner)
		push(sampleEllipseArc(cfg.startCorner.C, cfg.startCorner.rx, cfg.startCorner.ry, cfg.fullStartInner, cfg.inStart))
	}

	// Straight inner edge to the end corner.
	pts.push(cfg.inEnd)

	// End corner: inner arc, miter line, outer arc.
	if (adj.end) {
		const m = cornerMiter(cfg.endCorner)
		push(sampleEllipseArc(cfg.endCorner.C, cfg.endCorner.rx, cfg.endCorner.ry, cfg.inEnd, m.inner))
		pts.push(m.outer)
		push(sampleCircleArc(cfg.endCorner.C, cfg.endCorner.R, m.outer, cfg.outEnd))
	} else {
		push(sampleEllipseArc(cfg.endCorner.C, cfg.endCorner.rx, cfg.endCorner.ry, cfg.inEnd, cfg.fullEndInner))
		pts.push(cfg.fullEndOuter)
		push(sampleCircleArc(cfg.endCorner.C, cfg.endCorner.R, cfg.fullEndOuter, cfg.outEnd))
	}

	return pts
}

function toCustGeom(pts: Pt[]): CustGeomPoint[] {
	const out: CustGeomPoint[] = []
	for (let i = 0; i < pts.length; i++) {
		out.push(i === 0 ? { x: pts[i][0], y: pts[i][1], moveTo: true } : { x: pts[i][0], y: pts[i][1] })
	}
	out.push({ close: true })
	return out
}

export function buildBorderSidePoints(
	side: Side,
	w: number,
	h: number,
	radii: CornerRadii,
	widths: BorderWidths,
	adj: AdjacentInfo,
): CustGeomPoint[] {
	const iW = pxToInch(w)
	const iH = pxToInch(h)
	const wt = pxToInch(widths.top)
	const wr = pxToInch(widths.right)
	const wb = pxToInch(widths.bottom)
	const wl = pxToInch(widths.left)
	const rTL = pxToInch(radii.tl)
	const rTR = pxToInch(radii.tr)
	const rBR = pxToInch(radii.br)
	const rBL = pxToInch(radii.bl)

	const tl: Corner = { O: [0, 0], C: [rTL, rTL], R: rTL, I: [wl, wt], rx: Math.max(rTL - wl, 0), ry: Math.max(rTL - wt, 0) }
	const tr: Corner = { O: [iW, 0], C: [iW - rTR, rTR], R: rTR, I: [iW - wr, wt], rx: Math.max(rTR - wr, 0), ry: Math.max(rTR - wt, 0) }
	const br: Corner = { O: [iW, iH], C: [iW - rBR, iH - rBR], R: rBR, I: [iW - wr, iH - wb], rx: Math.max(rBR - wr, 0), ry: Math.max(rBR - wb, 0) }
	const bl: Corner = { O: [0, iH], C: [rBL, iH - rBL], R: rBL, I: [wl, iH - wb], rx: Math.max(rBL - wl, 0), ry: Math.max(rBL - wb, 0) }

	let cfg: SideConfig
	switch (side) {
		case "left":
			cfg = {
				startCorner: tl, endCorner: bl,
				outStart: [0, rTL], inStart: [wl, rTL],
				outEnd: [0, iH - rBL], inEnd: [wl, iH - rBL],
				fullStartOuter: [rTL, 0], fullStartInner: [rTL, wt],
				fullEndOuter: [rBL, iH], fullEndInner: [rBL, iH - wb],
			}
			break
		case "top":
			cfg = {
				startCorner: tl, endCorner: tr,
				outStart: [rTL, 0], inStart: [rTL, wt],
				outEnd: [iW - rTR, 0], inEnd: [iW - rTR, wt],
				fullStartOuter: [0, rTL], fullStartInner: [wl, rTL],
				fullEndOuter: [iW, rTR], fullEndInner: [iW - wr, rTR],
			}
			break
		case "right":
			cfg = {
				startCorner: tr, endCorner: br,
				outStart: [iW, rTR], inStart: [iW - wr, rTR],
				outEnd: [iW, iH - rBR], inEnd: [iW - wr, iH - rBR],
				fullStartOuter: [iW - rTR, 0], fullStartInner: [iW - rTR, wt],
				fullEndOuter: [iW - rBR, iH], fullEndInner: [iW - rBR, iH - wb],
			}
			break
		case "bottom":
			cfg = {
				startCorner: bl, endCorner: br,
				outStart: [rBL, iH], inStart: [rBL, iH - wb],
				outEnd: [iW - rBR, iH], inEnd: [iW - rBR, iH - wb],
				fullStartOuter: [0, iH - rBL], fullStartInner: [wl, iH - rBL],
				fullEndOuter: [iW, iH - rBR], fullEndInner: [iW - wr, iH - rBR],
			}
			break
	}

	return toCustGeom(tracePoints(cfg, adj))
}

/**
 * Build a filled trapezoid for a single straight (non-rounded) border side.
 * Adjacent sides meet along the corner diagonal (CSS miter join), so differently
 * coloured borders tile the corner with no gap and no overlap. Units are inches.
 */
export function buildSquareBorderPoints(
	side: Side,
	w: number,
	h: number,
	widths: BorderWidths,
	visible: Set<Side>,
): CustGeomPoint[] {
	const iW = pxToInch(w)
	const iH = pxToInch(h)
	const wt = pxToInch(widths.top)
	const wr = pxToInch(widths.right)
	const wb = pxToInch(widths.bottom)
	const wl = pxToInch(widths.left)

	let poly: Pt[]
	switch (side) {
		case "top": {
			const il = visible.has("left") ? wl : 0
			const ir = visible.has("right") ? iW - wr : iW
			poly = [[0, 0], [iW, 0], [ir, wt], [il, wt]]
			break
		}
		case "bottom": {
			const il = visible.has("left") ? wl : 0
			const ir = visible.has("right") ? iW - wr : iW
			poly = [[0, iH], [iW, iH], [ir, iH - wb], [il, iH - wb]]
			break
		}
		case "left": {
			const it = visible.has("top") ? wt : 0
			const ib = visible.has("bottom") ? iH - wb : iH
			poly = [[0, 0], [0, iH], [wl, ib], [wl, it]]
			break
		}
		case "right": {
			const it = visible.has("top") ? wt : 0
			const ib = visible.has("bottom") ? iH - wb : iH
			poly = [[iW, 0], [iW, iH], [iW - wr, ib], [iW - wr, it]]
			break
		}
	}

	return toCustGeom(poly)
}

