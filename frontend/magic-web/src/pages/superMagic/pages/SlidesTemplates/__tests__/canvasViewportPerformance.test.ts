import { describe, expect, it } from "vitest"
import { SLIDES_TEMPLATE_CANVAS_MIN_SCALE } from "../canvasZoom"
import { getTemplateCanvasViewportOverscan } from "../canvasViewport"

describe("slides template canvas viewport performance", () => {
	it("reduces the render overscan at the minimum canvas scale", () => {
		const defaultOverscan = getTemplateCanvasViewportOverscan(1)
		const minimumScaleOverscan = getTemplateCanvasViewportOverscan(
			SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
		)

		expect(minimumScaleOverscan.overscanX).toBeLessThan(defaultOverscan.overscanX)
		expect(minimumScaleOverscan.overscanY).toBeLessThan(defaultOverscan.overscanY)
	})
})
