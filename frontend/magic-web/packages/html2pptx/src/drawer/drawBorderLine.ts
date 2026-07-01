import type { PPTBorderLineNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { mapDashType } from "../shared/line"
import { inchToPt } from "../shared/unit"

export function drawBorderLine(
	slide: Slide,
	node: PPTBorderLineNode,
): void {
	const { x, y, w, h, side, line } = node

	if (node.points) {
		const fillOptions: Record<string, unknown> = { color: node.fillColor ?? line.color }
		if (node.fillTransparency !== undefined && node.fillTransparency > 0) {
			fillOptions.transparency = node.fillTransparency
		}
		const shapeName = "custGeom" as Parameters<typeof slide.addShape>[0]
		const options: Record<string, unknown> = {
			x,
			y,
			w,
			h,
			points: node.points,
			fill: fillOptions,
			line: { type: "none" },
		}
		slide.addShape(shapeName, options)
		return
	}

	let x1: number, y1: number, x2: number, y2: number

	switch (side) {
		case "top":
			x1 = x
			y1 = y
			x2 = x + w
			y2 = y
			break
		case "right":
			x1 = x + w
			y1 = y
			x2 = x + w
			y2 = y + h
			break
		case "bottom":
			x1 = x
			y1 = y + h
			x2 = x + w
			y2 = y + h
			break
		case "left":
			x1 = x
			y1 = y
			x2 = x
			y2 = y + h
			break
	}

	const lineW = x2 - x1
	const lineH = y2 - y1

	if (lineW === 0 && lineH === 0) {
		log(LogLevel.L3, "Skipping zero-length line")
		return
	}

	const lineOptions: Record<string, unknown> = {
		x: x1,
		y: y1,
		w: Math.abs(lineW),
		h: Math.abs(lineH),
		line: {
			color: line.color,
			width: inchToPt(line.width),
			dashType: mapDashType(line.style),
		},
	}
	if (line.transparency !== undefined) {
		;(lineOptions.line as Record<string, unknown>).transparency = line.transparency
	}
	slide.addShape("line", lineOptions)
}
