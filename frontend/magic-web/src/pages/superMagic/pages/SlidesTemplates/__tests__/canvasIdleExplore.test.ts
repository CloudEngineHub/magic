import { describe, expect, it } from "vitest"
import {
	getSlidesTemplateCanvasIdleExploreVelocity,
	SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_DIRECTION_DURATION_MS,
	SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_SPEED_PX_PER_SECOND,
} from "../canvasIdleExplore"

describe("slides template canvas idle exploration", () => {
	it("cycles through four diagonal directions at a fixed slow speed", () => {
		const duration = SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_DIRECTION_DURATION_MS
		const speed = SLIDES_TEMPLATE_CANVAS_IDLE_EXPLORE_SPEED_PX_PER_SECOND
		const componentSpeed = speed * Math.SQRT1_2

		expect(getSlidesTemplateCanvasIdleExploreVelocity(0)).toEqual({
			x: -componentSpeed,
			y: -componentSpeed,
		})
		expect(getSlidesTemplateCanvasIdleExploreVelocity(duration)).toEqual({
			x: componentSpeed,
			y: -componentSpeed,
		})
		expect(getSlidesTemplateCanvasIdleExploreVelocity(duration * 2)).toEqual({
			x: -componentSpeed,
			y: componentSpeed,
		})
		expect(getSlidesTemplateCanvasIdleExploreVelocity(duration * 3)).toEqual({
			x: componentSpeed,
			y: componentSpeed,
		})
		expect(getSlidesTemplateCanvasIdleExploreVelocity(duration * 4)).toEqual({
			x: -componentSpeed,
			y: -componentSpeed,
		})
	})
})
