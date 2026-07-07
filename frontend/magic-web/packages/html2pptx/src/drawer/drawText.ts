import type { PPTTextNode, PPTTextRun, Slide } from "../ir/node"

/** Underline style type */
type UnderlineStyle = "sng" | "dbl" | "dash" | "dotted" | "none"

/**
 * Draw text onto the slide
 * Each PPTTextNode maps to one text box; rich text runs can preserve local styling
 */
export function drawText(slide: Slide, node: PPTTextNode): void {
	const {
		text,
		x,
		y,
		w,
		h,
		fontSize,
		fontFace,
		color,
		bold,
		italic,
		underline,
		strike,
		transparency,
		charSpacing,
		lineSpacing,
		margin,
		rotate,
		outline,
	} = node

	const options: Record<string, unknown> = {
		x,
		y,
		w,
		h,
		fontSize,
		fontFace,
		bold,
		italic,
		underline: underline ? { style: "sng" as UnderlineStyle } : undefined,
		strike: strike ? true : undefined,
		charSpacing, // Apply character spacing
		lineSpacingMultiple: lineSpacing ?? undefined, // Disable this for single-line text to avoid applying line-height twice
		margin: margin ?? [0, 0, 0, 0],
		wrap: node.wrap ?? true,
		rotate: rotate, // Apply rotation
		outline, // Apply text outline
	}

	// Color handling
	if (typeof color !== "string" && color.type === "gradient") {
		const stops = color.stops.map((s) => ({
			position: Math.round(s.position * 100),
			color: s.color,
			transparency: s.transparency,
		}))

		if (color.gradientType === "radial") {
			options.color = {
				type: "radialGradient",
				style: color.style || "ellipse",
				stops,
				rotWithShape: color.rotWithShape ?? true,
				flip: color.flip ?? "none",
				tileRect: color.tileRect,
			}
		} else {
			options.color = {
				type: "linearGradient",
				angle: color.angle ?? 0,
				stops,
				scaled: color.scaled ?? false,
				rotWithShape: color.rotWithShape ?? false,
				flip: color.flip ?? "none",
				tileRect: color.tileRect,
			}
		}
	} else {
		options.color = color
	}

	// Transparency
	if (transparency && transparency > 0) {
		options.transparency = transparency
	}

	slide.addText(resolveTextInput(text), options)
}

function resolveTextInput(
	text: PPTTextNode["text"],
): string | Array<{ text: string; options?: Record<string, unknown> }> {
	if (typeof text === "string") return text
	return text.map((run) => ({
		text: run.text,
		options: resolveRunOptions(run),
	}))
}

function resolveRunOptions(run: PPTTextRun): Record<string, unknown> | undefined {
	const options = run.options
	if (!options) return undefined

	const {
		fontWeight,
		underline,
		strike,
		...rest
	} = options
	void fontWeight

	const output: Record<string, unknown> = { ...rest }
	if (underline) output.underline = { style: "sng" as UnderlineStyle }
	if (strike) output.strike = true

	return Object.keys(output).length > 0 ? output : undefined
}
