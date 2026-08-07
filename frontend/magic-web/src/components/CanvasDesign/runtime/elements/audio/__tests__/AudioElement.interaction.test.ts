import { describe, expect, it } from "vitest"
import { resolveAudioControlInteractionPolicy } from "../AudioElement.interaction"

describe("resolveAudioControlInteractionPolicy", () => {
	it("keeps full player interaction when desktop controls are comfortably visible", () => {
		expect(
			resolveAudioControlInteractionPolicy({
				screenWidth: 320,
				screenHeight: 180,
				coarsePointer: false,
			}),
		).toEqual({ mode: "full", progressMinimumScreenHeight: 32 })
	})

	it("uses compact track interaction before prioritizing element dragging", () => {
		expect(
			resolveAudioControlInteractionPolicy({
				screenWidth: 240,
				screenHeight: 120,
				coarsePointer: false,
			}),
		).toEqual({ mode: "compact", progressMinimumScreenHeight: 16 })

		expect(
			resolveAudioControlInteractionPolicy({
				screenWidth: 160,
				screenHeight: 90,
				coarsePointer: false,
			}),
		).toEqual({ mode: "drag-only", progressMinimumScreenHeight: 16 })
	})

	it("requires more visible space for touch controls", () => {
		expect(
			resolveAudioControlInteractionPolicy({
				screenWidth: 320,
				screenHeight: 180,
				coarsePointer: true,
			}),
		).toEqual({ mode: "compact", progressMinimumScreenHeight: 24 })

		expect(
			resolveAudioControlInteractionPolicy({
				screenWidth: 220,
				screenHeight: 140,
				coarsePointer: true,
			}),
		).toEqual({ mode: "drag-only", progressMinimumScreenHeight: 24 })
	})
})
