import { describe, expect, it } from "vitest"
import {
	getCaptureOutputSize,
	getCaptureSurfaceGeometry,
	getRootCaptureSelection,
	resolveCaptureScreenSelection,
	toBitmapCropSelection,
	toRenderedSelection,
} from "../screenshot"

describe("HTML screenshot geometry", () => {
	it("uses visual viewport dimensions for the screenshot output", () => {
		expect(
			getCaptureOutputSize(
				{ left: 123, top: 157, width: 780, height: 390 },
				{ left: 360, top: 320, width: 400, height: 200 },
			),
		).toEqual({ width: 400, height: 200 })
	})

	it("maps iframe CSS coordinates to visual screen coordinates", () => {
		expect(
			toRenderedSelection(
				{ clientWidth: 800, clientHeight: 600 },
				{ left: 100, top: 50, width: 400, height: 300 },
				{ left: 80, top: 60, width: 200, height: 100 },
			),
		).toEqual({ left: 140, top: 80, width: 100, height: 50 })
	})

	it("keeps coordinates stable when the iframe is not scaled", () => {
		expect(
			toRenderedSelection(
				{ clientWidth: 400, clientHeight: 300 },
				{ left: 10, top: 20, width: 400, height: 300 },
				{ left: 4, top: 8, width: 120, height: 80 },
			),
		).toEqual({ left: 14, top: 28, width: 120, height: 80 })
	})

	it("uses the host drag rectangle directly for cross-origin capture", () => {
		const hostSelection = { left: 132, top: 188, width: 358, height: 296 }

		expect(
			resolveCaptureScreenSelection(
				{ clientWidth: 1920, clientHeight: 1080 },
				{ left: -180, top: 80, width: 1100, height: 620 } as DOMRect,
				{ left: 520, top: 180, width: 474, height: 388 },
				hostSelection,
			),
		).toEqual(hostSelection)
	})

	it("anchors PPT crops to the slide root rather than the full document", () => {
		expect(
			getRootCaptureSelection(
				{ left: 240, top: 180, width: 640, height: 310 },
				{ left: -120, top: -90, width: 1920, height: 1080 },
			),
		).toEqual({ left: 360, top: 270, width: 640, height: 310 })
	})

	it("keeps root-local coordinates stable while the iframe scrolls", () => {
		expect(
			getRootCaptureSelection(
				{ left: 120, top: 80, width: 240, height: 120 },
				{ left: -40, top: -60, width: 1920, height: 1080 },
			),
		).toEqual({ left: 160, top: 140, width: 240, height: 120 })
	})

	it("keeps the requested output size when the snapdom bitmap has rounding drift", () => {
		const crop = toBitmapCropSelection(
			{ left: 120, top: 80, width: 640, height: 310 },
			{ width: 644, height: 316 },
			{ width: 640, height: 310 },
		)

		expect(crop.left).toBeCloseTo(120.75)
		expect(crop.top).toBeCloseTo(81.54838709677419)
		expect(crop.width).toBeCloseTo(644)
		expect(crop.height).toBeCloseTo(316)
		expect(crop.outputWidth).toBe(640)
		expect(crop.outputHeight).toBe(310)
	})

	it("accounts for browser chrome when the selected surface is a window", () => {
		expect(
			getCaptureSurfaceGeometry("window", {
				innerWidth: 1440,
				innerHeight: 900,
				outerWidth: 1470,
				outerHeight: 1000,
			}),
		).toEqual({
			width: 1470,
			height: 1000,
			viewportOffsetX: 15,
			viewportOffsetY: 100,
		})
	})

	it("keeps a browser-tab capture anchored at the viewport origin", () => {
		expect(
			getCaptureSurfaceGeometry("browser", {
				innerWidth: 1440,
				innerHeight: 900,
				outerWidth: 1470,
				outerHeight: 1000,
			}),
		).toEqual({
			width: 1440,
			height: 900,
			viewportOffsetX: 0,
			viewportOffsetY: 0,
		})
	})
})
