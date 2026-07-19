import type { TemplateCanvasPoint } from "./canvasLayout"

export const SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_DIRECTION_DURATION_MS = 12_000
export const SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_SPEED_PX_PER_SECOND = 18

const IDLE_EXPLORE_DIRECTIONS: readonly [
	TemplateCanvasPoint,
	TemplateCanvasPoint,
	TemplateCanvasPoint,
	TemplateCanvasPoint,
] = [
	{ x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
	{ x: Math.SQRT1_2, y: -Math.SQRT1_2 },
	{ x: -Math.SQRT1_2, y: Math.SQRT1_2 },
	{ x: Math.SQRT1_2, y: Math.SQRT1_2 },
]

export function getSlidesTemplateCanvasIdleExploreVelocity(elapsedMs: number): TemplateCanvasPoint {
	const directionIndex =
		Math.floor(
			Math.max(0, elapsedMs) / SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_DIRECTION_DURATION_MS,
		) % IDLE_EXPLORE_DIRECTIONS.length
	const direction = IDLE_EXPLORE_DIRECTIONS[directionIndex] ?? IDLE_EXPLORE_DIRECTIONS[0]

	return {
		x: direction.x * SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_SPEED_PX_PER_SECOND,
		y: direction.y * SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_SPEED_PX_PER_SECOND,
	}
}
