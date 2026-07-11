import { describe, expect, it } from "vitest"
import {
	SLIDES_TEMPLATE_CANVAS_MAX_SCALE,
	SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
	clampTemplateCanvasScale,
	getNextTemplateCanvasScale,
	isTrackpadPanWheel,
} from "../canvasZoom"

describe("slides template canvas zoom", () => {
	it("prevents zooming out below the readable rendering limit", () => {
		expect(SLIDES_TEMPLATE_CANVAS_MIN_SCALE).toBe(0.85)
		expect(clampTemplateCanvasScale(0.1)).toBe(SLIDES_TEMPLATE_CANVAS_MIN_SCALE)
		expect(getNextTemplateCanvasScale(1, 10_000)).toBe(SLIDES_TEMPLATE_CANVAS_MIN_SCALE)
	})

	it("keeps the existing maximum zoom limit", () => {
		expect(clampTemplateCanvasScale(10)).toBe(SLIDES_TEMPLATE_CANVAS_MAX_SCALE)
	})

	it("keeps large deltas in an active trackpad gesture as pan events", () => {
		const event = {
			ctrlKey: false,
			deltaMode: 0,
			deltaX: 0,
			deltaY: 120,
			metaKey: false,
		} as WheelEvent

		expect(isTrackpadPanWheel(event)).toBe(false)
		expect(isTrackpadPanWheel(event, true)).toBe(true)
	})

	it("keeps pinch gestures as zoom events during an active pan gesture", () => {
		const event = {
			ctrlKey: true,
			deltaMode: 0,
			deltaX: 0,
			deltaY: 24,
			metaKey: false,
		} as WheelEvent

		expect(isTrackpadPanWheel(event, true)).toBe(false)
	})
})
