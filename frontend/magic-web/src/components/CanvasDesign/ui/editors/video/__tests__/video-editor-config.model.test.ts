import { describe, expect, it } from "vitest"
import type { VideoInputModeConfig, VideoModelItem } from "../../../public/magic-types"
import {
	resolveSelectableInputModeForAvailableModes,
	resolveVideoReferenceVideoModel,
} from "../model-config/video-editor-config.model"

function createVideoModel(
	modelId: string,
	inputModes: Partial<Record<string, VideoInputModeConfig>>,
): VideoModelItem {
	return {
		id: modelId,
		group_id: modelId,
		model_id: modelId,
		model_name: modelId,
		provider_model_id: modelId,
		model_description: "",
		model_icon: "",
		model_status: "normal",
		sort: 0,
		video_generation_config: {
			input_modes: inputModes,
		} as VideoModelItem["video_generation_config"],
	}
}

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

describe("resolveVideoReferenceVideoModel", () => {
	it("prefers the current model when it supports reference videos", () => {
		const currentModel = createVideoModel("current", {
			omni_reference: {
				supported_fields: ["reference_videos"],
				task: "edit",
			},
		})
		const fallbackModel = createVideoModel("fallback", {
			video_edit: { supported_fields: ["reference_videos"] },
		})

		expect(
			resolveVideoReferenceVideoModel([fallbackModel, currentModel], "current"),
		).toMatchObject({
			model: currentModel,
			inputMode: "omni_reference",
			task: "edit",
			maxReferenceVideos: Infinity,
		})
	})

	it("uses the configured mode order within a model", () => {
		const model = createVideoModel("model", {
			omni_reference: { supported_fields: ["reference_videos"] },
			video_edit: { supported_fields: ["reference_videos"] },
		})

		expect(resolveVideoReferenceVideoModel([model])).toMatchObject({
			inputMode: "omni_reference",
		})
	})

	it("falls back to the first supported model", () => {
		const unsupportedModel = createVideoModel("unsupported", {
			standard: { supported_fields: [] },
		})
		const supportedModel = createVideoModel("supported", {
			omni_reference: {
				supported_fields: ["reference_videos"],
				max_count: 2,
			},
		})

		expect(resolveVideoReferenceVideoModel([unsupportedModel, supportedModel])).toMatchObject({
			model: supportedModel,
			maxReferenceVideos: 2,
		})
	})

	it("returns null when reference videos are unsupported or unavailable", () => {
		const unsupportedModel = createVideoModel("unsupported", {
			video_edit: { supported_fields: ["reference_images"] },
		})
		const zeroLimitModel = createVideoModel("zero", {
			video_edit: {
				supported_fields: ["reference_videos"],
				variants: [{ code: "no-video", limits: { reference_videos: { max: 0 } } }],
			},
		})
		const minimumTwoModel = createVideoModel("minimum-two", {
			video_edit: {
				supported_fields: ["reference_videos"],
				variants: [{ code: "two-videos", limits: { reference_videos: { min: 2 } } }],
			},
		})
		const requiresImageModel = createVideoModel("requires-image", {
			video_edit: {
				supported_fields: ["reference_images", "reference_videos"],
				variants: [
					{
						code: "image-and-video",
						limits: { reference_images: { min: 1 }, reference_videos: { min: 1 } },
					},
				],
			},
		})

		expect(resolveVideoReferenceVideoModel([unsupportedModel])).toBeNull()
		expect(resolveVideoReferenceVideoModel([zeroLimitModel])).toBeNull()
		expect(resolveVideoReferenceVideoModel([minimumTwoModel])).toBeNull()
		expect(resolveVideoReferenceVideoModel([requiresImageModel])).toBeNull()
	})
})
