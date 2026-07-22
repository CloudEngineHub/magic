export const CONNECTION_LINE_STYLE = {
	stroke: "#333333",
	strokeWidth: 3,
	opacity: 0.4,
	shadowColor: "rgba(0, 0, 0, 0.25)",
	shadowBlur: 0,
	shadowOpacity: 0,
} as const

export const CONNECTION_HOVER_LINE_STYLE = {
	stroke: "rgba(59, 130, 246, 0.58)",
	strokeWidth: 3,
	opacity: 0.85,
	shadowColor: "rgba(59, 130, 246, 0.28)",
	shadowBlur: 0,
	shadowOpacity: 0,
} as const

export const CONNECTION_SELECTED_LINE_STYLE = {
	stroke: "#3B82F6",
	strokeWidth: 3,
	opacity: 1,
	shadowColor: CONNECTION_HOVER_LINE_STYLE.shadowColor,
	shadowBlur: 0,
	shadowOpacity: 0,
} as const

export const CONNECTION_HIT_STYLE = {
	strokeWidth: 16,
} as const

export const CONNECTION_BOX_SELECTION_STYLE = {
	hitPaddingPx: 6,
} as const

export const CONNECTION_DRAG_PREVIEW_STYLE = {
	...CONNECTION_LINE_STYLE,
	dash: [5, 5],
} as const

export const CONNECTION_DRAG_VALID_PREVIEW_STYLE = {
	...CONNECTION_HOVER_LINE_STYLE,
	opacity: 0.72,
	dash: CONNECTION_DRAG_PREVIEW_STYLE.dash,
} as const

export const CONNECTION_DRAG_INVALID_PREVIEW_STYLE = {
	stroke: "rgba(239, 68, 68, 0.68)",
	strokeWidth: CONNECTION_DRAG_PREVIEW_STYLE.strokeWidth,
	opacity: 0.75,
	shadowColor: "rgba(239, 68, 68, 0.24)",
	shadowBlur: CONNECTION_DRAG_PREVIEW_STYLE.shadowBlur,
	shadowOpacity: CONNECTION_DRAG_PREVIEW_STYLE.shadowOpacity,
	dash: [4, 6],
} as const

export const CONNECTION_DRAG_VALID_TARGET_STYLE = {
	stroke: "rgba(59, 130, 246, 0.72)",
	strokeWidth: 1.5,
	dash: [],
	cornerRadius: 0,
} as const

export const CONNECTION_DRAG_INVALID_TARGET_STYLE = {
	stroke: "rgba(239, 68, 68, 0.72)",
	strokeWidth: 1.5,
	dash: [4, 4],
	cornerRadius: 0,
} as const

export const CONNECTION_CURVE_STYLE = {
	controlOffsetRatio: 0.5,
	controlOffsetMin: 60,
} as const

export const CONNECTION_STROKE_SCALE_STYLE = {
	shrinkStartScale: 0.08,
	shrinkExponent: 0.5,
	minScreenStrokeWidth: 1.1,
} as const

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

function getSafeScale(scale: number): number {
	return Number.isFinite(scale) && scale > 0 ? scale : 1
}

export function resolveConnectionScreenStrokeWidth(baseStrokeWidth: number, scale: number): number {
	const safeScale = getSafeScale(scale)
	if (safeScale >= CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale) {
		return baseStrokeWidth
	}

	const shrinkRatio = safeScale / CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale
	return clamp(
		baseStrokeWidth * Math.pow(shrinkRatio, CONNECTION_STROKE_SCALE_STYLE.shrinkExponent),
		CONNECTION_STROKE_SCALE_STYLE.minScreenStrokeWidth,
		baseStrokeWidth,
	)
}

export function resolveConnectionCanvasStrokeWidth(baseStrokeWidth: number, scale: number): number {
	const safeScale = getSafeScale(scale)
	return resolveConnectionScreenStrokeWidth(baseStrokeWidth, safeScale) / safeScale
}
