import { describe, expect, it } from "vitest"
import {
	decideImageDisplayViewingLevel,
	getImageResourceMaxEdge,
	getImageResourceVariantForViewingLevel,
	getVideoPosterMaxEdge,
} from "../visibility/CanvasMediaViewingPolicy"

describe("CanvasMediaViewingPolicy", () => {
	it("maps image viewing levels to resource variants and decode sizes", () => {
		expect(getImageResourceVariantForViewingLevel("low")).toBe("low")
		expect(getImageResourceVariantForViewingLevel("preview")).toBe("preview")
		expect(getImageResourceVariantForViewingLevel("full")).toBe("full")
		expect(getImageResourceMaxEdge("low")).toBe(384)
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
			level: "low",
			variant: "low",
			reason: "low-screen-long-edge",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "near",
				screenArea: 600 * 600,
				screenLongEdge: 600,
			}),
		).toMatchObject({
			level: "low",
			variant: "low",
			reason: "near-viewport",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 300 * 300,
				screenLongEdge: 300,
			}),
		).toMatchObject({
			level: "low",
			variant: "low",
			reason: "low-screen-long-edge",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 800 * 800,
				screenLongEdge: 800,
			}),
		).toMatchObject({
			level: "preview",
			variant: "preview",
			reason: "preview-visible",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 600 * 20,
				screenLongEdge: 600,
			}),
		).toMatchObject({
			level: "preview",
			variant: "preview",
			reason: "preview-visible",
		})
	})

	it("keeps the previous image display variant inside hysteresis bands", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 140 * 140,
				screenLongEdge: 140,
				previousVariant: "low",
			}),
		).toMatchObject({
			variant: "low",
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

	it("promotes visible images to preview while keeping low hysteresis", () => {
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
				previousVariant: "low",
			}),
		).toMatchObject({
			variant: "low",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 370 * 370,
				screenLongEdge: 370,
				previousVariant: "low",
			}),
		).toMatchObject({
			variant: "preview",
		})
	})

	it("promotes visible images to full at the full screen long edge threshold", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 1536 * 1536,
				screenLongEdge: 1536,
			}),
		).toMatchObject({
			level: "full",
			variant: "full",
			reason: "full-visible",
		})
	})

	it("keeps full until the display size falls below the full hysteresis threshold", () => {
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 1200 * 1200,
				screenLongEdge: 1200,
				previousVariant: "full",
			}),
		).toMatchObject({
			variant: "full",
		})
		expect(
			decideImageDisplayViewingLevel({
				visibilityState: "visible",
				screenArea: 1100 * 1100,
				screenLongEdge: 1100,
				previousVariant: "full",
			}),
		).toMatchObject({
			variant: "preview",
		})
	})
})
