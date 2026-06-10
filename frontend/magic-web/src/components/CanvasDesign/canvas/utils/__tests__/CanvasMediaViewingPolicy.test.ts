import { describe, expect, it } from "vitest"
import {
	computeElementViewportMetrics,
	decideImageDisplayViewingLevel,
	decideMediaDetailLevel,
	getImageResourceMaxEdge,
	getImageResourceVariantForViewingLevel,
	getVideoPosterMaxEdge,
	type ElementViewportMetrics,
} from "../CanvasMediaViewingPolicy"

const BASE_METRICS: ElementViewportMetrics = {
	isVisible: true,
	screenWidth: 1600,
	screenHeight: 900,
	screenLongEdge: 1600,
	screenArea: 1600 * 900,
	intersectionArea: 100,
	visibleElementAreaRatio: 1,
	visibleViewportAreaRatio: 1,
}

function decide(overrides: Partial<Parameters<typeof decideMediaDetailLevel>[0]> = {}) {
	return decideMediaDetailLevel({
		metrics: BASE_METRICS,
		previewLongEdge: 1000,
		isActive: false,
		fullDecodedBytes: 40 * 1024 * 1024,
		fullNativeBytes: 86 * 1024 * 1024,
		maxFullDecodedBytes: 256 * 1024 * 1024,
		maxFullNativeBytes: 512 * 1024 * 1024,
		enterDisplayToPreviewRatio: 0.9,
		exitDisplayToPreviewRatio: 0.7,
		...overrides,
	})
}

describe("CanvasMediaViewingPolicy", () => {
	it("maps image viewing levels to resource variants and decode sizes", () => {
		expect(getImageResourceVariantForViewingLevel("tiny")).toBe("small")
		expect(getImageResourceVariantForViewingLevel("overview")).toBe("overview")
		expect(getImageResourceVariantForViewingLevel("standard")).toBe("preview")
		expect(getImageResourceVariantForViewingLevel("detail")).toBe("full")
		expect(getImageResourceMaxEdge("small")).toBe(72)
		expect(getImageResourceMaxEdge("overview")).toBe(384)
		expect(getImageResourceMaxEdge("preview")).toBe(1536)
		expect(getImageResourceMaxEdge("full")).toBeUndefined()
	})

	it("keeps video poster sizing in the same media viewing policy", () => {
		expect(getVideoPosterMaxEdge()).toBe(768)
	})

	it("decides display viewing level from visibility and screen long edge", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 64 * 64,
				screenLongEdge: 64,
			}),
		).toMatchObject({
			level: "tiny",
			variant: "small",
			reason: "tiny-screen-long-edge",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "near",
				screenArea: 600 * 600,
				screenLongEdge: 600,
			}),
		).toMatchObject({
			level: "overview",
			variant: "overview",
			reason: "near-viewport",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 300 * 300,
				screenLongEdge: 300,
			}),
		).toMatchObject({
			level: "overview",
			variant: "overview",
			reason: "overview-screen-long-edge",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 800 * 800,
				screenLongEdge: 800,
			}),
		).toMatchObject({
			level: "standard",
			variant: "preview",
			reason: "standard-visible",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 600 * 20,
				screenLongEdge: 600,
			}),
		).toMatchObject({
			level: "standard",
			variant: "preview",
			reason: "standard-visible",
		})
	})

	it("keeps the previous image display variant inside hysteresis bands", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 140 * 140,
				screenLongEdge: 140,
				previousVariant: "small",
			}),
		).toMatchObject({
			variant: "small",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 350 * 350,
				screenLongEdge: 350,
				previousVariant: "overview",
			}),
		).toMatchObject({
			variant: "overview",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 460 * 460,
				screenLongEdge: 460,
				previousVariant: "preview",
			}),
		).toMatchObject({
			variant: "preview",
		})
	})

	it("promotes visible images to preview earlier while keeping overview hysteresis", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 330 * 330,
				screenLongEdge: 330,
			}),
		).toMatchObject({
			variant: "preview",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 350 * 350,
				screenLongEdge: 350,
				previousVariant: "overview",
			}),
		).toMatchObject({
			variant: "overview",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 370 * 370,
				screenLongEdge: 370,
				previousVariant: "overview",
			}),
		).toMatchObject({
			variant: "preview",
		})
	})

	it("treats a tiny visible corner as visible", () => {
		const metrics = computeElementViewportMetrics({
			bounds: { x: 95, y: 95, width: 100, height: 100 },
			viewportRect: { x: 0, y: 0, width: 100, height: 100 },
			viewportScale: 2,
		})

		expect(metrics.isVisible).toBe(true)
		expect(metrics.intersectionArea).toBe(25)
		expect(metrics.screenLongEdge).toBe(200)
		expect(metrics.visibleElementAreaRatio).toBeCloseTo(0.0025)
	})

	it("marks an element outside the viewport as not visible", () => {
		const metrics = computeElementViewportMetrics({
			bounds: { x: 101, y: 0, width: 50, height: 50 },
			viewportRect: { x: 0, y: 0, width: 100, height: 100 },
			viewportScale: 1,
		})

		expect(metrics.isVisible).toBe(false)
		expect(metrics.intersectionArea).toBe(0)
	})

	it("enters full when the displayed long edge approaches preview pixels", () => {
		const decision = decide({
			metrics: {
				...BASE_METRICS,
				screenLongEdge: 900,
			},
		})

		expect(decision.target).toBe("full")
		expect(decision.reason).toBe("display-exceeds-preview")
		expect(decision.displayToPreviewRatio).toBe(0.9)
	})

	it("uses a lower exit threshold for the active full element", () => {
		const inactiveDecision = decide({
			metrics: {
				...BASE_METRICS,
				screenLongEdge: 800,
			},
		})
		const activeDecision = decide({
			isActive: true,
			metrics: {
				...BASE_METRICS,
				screenLongEdge: 800,
			},
		})

		expect(inactiveDecision.target).toBe("preview")
		expect(activeDecision.target).toBe("full")
	})

	it("does not enter full when the element is not visible", () => {
		const decision = decide({
			metrics: {
				...BASE_METRICS,
				isVisible: false,
				intersectionArea: 0,
			},
		})

		expect(decision.target).toBe("preview")
		expect(decision.reason).toBe("not-visible")
	})

	it("does not enter full when the full resource would exceed budget", () => {
		const decision = decide({
			fullDecodedBytes: 300 * 1024 * 1024,
			fullNativeBytes: 645 * 1024 * 1024,
		})

		expect(decision.target).toBe("preview")
		expect(decision.reason).toBe("full-too-large")
	})

	it("keeps the per-candidate decision path cheap for large visible sets", () => {
		const startedAt = performance.now()
		for (let index = 0; index < 20_000; index += 1) {
			const metrics = computeElementViewportMetrics({
				bounds: {
					x: index % 500,
					y: index % 300,
					width: 320,
					height: 240,
				},
				viewportRect: { x: 0, y: 0, width: 1440, height: 900 },
				viewportScale: 1 + (index % 4) * 0.25,
			})
			decide({ metrics })
		}
		const durationMs = performance.now() - startedAt

		expect(durationMs).toBeLessThan(250)
	})
})
