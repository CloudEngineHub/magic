import type { PPTShapeNode, Slide } from "../ir/node"
import { toPptxTextMargin } from "./textMargin"
import { mapDashType } from "../shared/line"
import { inchToPt } from "../shared/unit"

/**
 * Draw a shape onto the slide
 */
export function drawShape(slide: Slide, node: PPTShapeNode): void {
	const options: Record<string, unknown> = {
		x: node.x,
		y: node.y,
		w: node.w,
		h: node.h,
	}

	// Fill
	if (node.fill) {
		if (node.fill.type === "solid") {
			const fillOptions: Record<string, unknown> = { color: node.fill.color }
			if (node.fill.transparency !== undefined) {
				fillOptions.transparency = node.fill.transparency
			}
			options.fill = fillOptions
		} else if (node.fill.type === "gradient") {
			const stops = node.fill.stops.map((stop) => {
				const stopConfig: Record<string, unknown> = {
					position: Math.round(stop.position * 100),
					color: stop.color,
				}
				if (stop.transparency !== undefined) {
					stopConfig.transparency = stop.transparency
				}
				return stopConfig
			})

			if (node.fill.gradientType === "radial") {
				options.fill = {
					type: "radialGradient",
					style: node.fill.style || "ellipse",
					stops,
					rotWithShape: node.fill.rotWithShape ?? true,
					flip: node.fill.flip ?? "none",
					tileRect: node.fill.tileRect,
				}
			} else {
				options.fill = {
					type: "linearGradient",
					stops,
					angle: node.fill.angle ?? 0,
					scaled: node.fill.scaled ?? false,
					rotWithShape: node.fill.rotWithShape ?? false,
					flip: node.fill.flip ?? "none",
					tileRect: node.fill.tileRect,
				}
			}
		}
	} else {
		// Use transparent fill when there is no fill
		options.fill = { type: "none" }
	}

	// Border
	if (node.line) {
		const lineOptions: Record<string, unknown> = {
			color: node.line.color,
			width: inchToPt(node.line.width),
			dashType: mapDashType(node.line.style),
		}
		if (node.line.transparency !== undefined) {
			lineOptions.transparency = node.line.transparency
		}
		options.line = lineOptions
	} else {
		// No border
		options.line = { type: "none" }
	}

	// Shadow
	if (node.shadow) {
		options.shadow = {
			type: node.shadow.type,
			color: node.shadow.color,
			blur: node.shadow.blur,
			offset: node.shadow.offset,
			angle: node.shadow.angle,
			opacity: node.shadow.opacity,
		}
	}

	// Rounded corners - rectRadius only applies to roundRect
	// pptxgenjs source: adj = (rectRadius * EMU * 100000) / min(cx, cy)
	// This means rectRadius should be an absolute value in inches; pptxgenjs calculates the ratio internally
	// so pass the corner radius in inches directly
	if (node.shapeType === "roundRect" && node.radius && node.radius > 0) {
		const minDimension = Math.min(node.w, node.h)
		if (minDimension > 0) {
			// Clamp the corner radius to at most half of the shorter side
			const maxRadius = minDimension / 2
			options.rectRadius = Math.min(node.radius, maxRadius)
		}
	}

	// custGeom path points
	if (node.shapeType === "custGeom" && node.points) {
		options.points = node.points
		options.line = options.line ?? { type: "none" }
	}

	// Soft edges, used to simulate CSS blur
	if (node.softEdge && node.softEdge > 0) {
		options.softEdge = { radius: node.softEdge }
	}

	// Rotation angle
	if (node.rotate) {
		options.rotate = node.rotate
	}

	const shapeName = (node.shapeType || "rect") as Parameters<typeof slide.addShape>[0]
	if (node.text) {
		const text = node.text
		slide.addText(text.value, {
			...options,
			shape: shapeName,
			fontSize: text.fontSize,
			fontFace: text.fontFace,
			color: text.color,
			bold: text.bold,
			italic: text.italic,
			underline: text.underline ? { style: "sng" } : undefined,
			strike: text.strike,
			align: text.align,
			valign: text.valign,
				margin: toPptxTextMargin(text.margin ?? [0, 0, 0, 0]),
			wrap: text.wrap ?? false,
			fit: "shrink",
		})
		return
	}

	slide.addShape(shapeName, options)
}
