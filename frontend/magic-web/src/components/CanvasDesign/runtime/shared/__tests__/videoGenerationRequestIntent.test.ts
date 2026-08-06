import { describe, expect, it } from "vitest"
import type { GenerateVideoRequest } from "../../../public/magic-types"
import {
	hasVideoGenerationRequestEstimateIntent,
	hasVideoGenerationRequestMediaIntent,
	hasVideoGenerationRequestSubmitIntent,
} from "../videoGenerationRequestIntent"

describe("videoGenerationRequestIntent", () => {
	it("requires prompt or media input for estimate intent", () => {
		expect(
			hasVideoGenerationRequestEstimateIntent({
				model_id: "video-model",
				prompt: " ",
			}),
		).toBe(false)
		expect(
			hasVideoGenerationRequestEstimateIntent({
				model_id: "video-model",
				prompt: "make a launch video",
			}),
		).toBe(true)
	})

	it("treats video generation media inputs as user intent", () => {
		const request: Partial<GenerateVideoRequest> = {
			model_id: "video-model",
			prompt: " ",
			inputs: {
				frames: [{ role: "start", uri: "./images/start.jpg" }],
				reference_videos: [{ uri: "./videos/linked.mp4" }],
			},
		}

		expect(hasVideoGenerationRequestMediaIntent(request)).toBe(true)
		expect(hasVideoGenerationRequestEstimateIntent(request)).toBe(true)
	})

	it("requires a non-empty prompt for submit intent", () => {
		expect(
			hasVideoGenerationRequestSubmitIntent({
				model_id: "video-model",
				prompt: " ",
				inputs: {
					reference_videos: [{ uri: "./videos/linked.mp4" }],
				},
			}),
		).toBe(false)
		expect(
			hasVideoGenerationRequestSubmitIntent({
				model_id: "video-model",
				prompt: "make a launch video",
			}),
		).toBe(true)
	})

	it("ignores empty media fields and supports legacy request fields", () => {
		expect(
			hasVideoGenerationRequestMediaIntent({
				inputs: {
					reference_images: [{ uri: " " }],
				},
			}),
		).toBe(false)
		expect(
			hasVideoGenerationRequestMediaIntent({
				reference_images: ["./images/legacy.jpg"],
			} as Partial<GenerateVideoRequest>),
		).toBe(true)
	})
})
