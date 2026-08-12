import { describe, expect, it } from "vitest"
import { resolveSelectableInputModeForAvailableModes } from "../model-config/video-editor-config.model"

describe("resolveSelectableInputModeForAvailableModes", () => {
	it("moves the transient standard mode to omni reference when that tab is available", () => {
		expect(
			resolveSelectableInputModeForAvailableModes(
				["standard", "omni_reference", "image_reference"],
				"standard",
			),
		).toBe("omni_reference")
	})

	it("uses the normal fallback order when omni reference is unavailable", () => {
		expect(
			resolveSelectableInputModeForAvailableModes(
				["standard", "keyframe_guided", "image_reference"],
				"standard",
			),
		).toBe("keyframe_guided")
	})

	it("preserves a selected non-standard mode", () => {
		expect(
			resolveSelectableInputModeForAvailableModes(
				["standard", "omni_reference", "image_reference"],
				"image_reference",
			),
		).toBe("image_reference")
	})

	it("keeps standard when it is the only available mode", () => {
		expect(resolveSelectableInputModeForAvailableModes(["standard"], "standard")).toBe(
			"standard",
		)
	})
})
