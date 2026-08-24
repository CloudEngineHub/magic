import { describe, expect, it } from "vitest"
import type { VideoModelItem } from "../../../../../public/magic-types"
import {
	buildVideoDurationOptions,
	getVideoDurationConfig,
	resolveVideoDefaultDuration,
} from "../video-editor-config.generation"

function createModel(generation: Record<string, unknown>): VideoModelItem {
	return {
		id: "model-id",
		group_id: "group-id",
		model_id: "model-id",
		model_name: "model",
		provider_model_id: "provider-model",
		model_description: "",
		model_icon: "",
		model_status: "normal" as VideoModelItem["model_status"],
		sort: 0,
		video_generation_config: { generation: generation as never },
	}
}

describe("video generation duration configuration", () => {
	it("keeps discrete duration options", () => {
		const model = createModel({
			duration_type: "options",
			durations: [4, 5, 8],
			default_duration_seconds: 5,
		})

		expect(buildVideoDurationOptions(model)).toEqual([4, 5, 8])
		expect(getVideoDurationConfig(model)).toEqual({ type: "options" })
		expect(resolveVideoDefaultDuration(model)).toBe(5)
	})

	it("expands range values for validation while exposing range metadata", () => {
		const model = createModel({
			duration_type: "range",
			durations: { min: 4, max: 8, step: 2 },
			default_duration_seconds: 6,
		})

		expect(buildVideoDurationOptions(model)).toEqual([4, 6, 8])
		expect(getVideoDurationConfig(model)).toEqual({
			type: "range",
			range: { min: 4, max: 8, step: 2 },
		})
		expect(resolveVideoDefaultDuration(model)).toBe(6)
	})

	it("lets active mode constraints narrow a model range", () => {
		const model = createModel({
			duration_type: "range",
			durations: { min: 4, max: 12, step: 1 },
			default_duration_seconds: 10,
		})
		const constraints = { durations: [5, 7, 9] }

		expect(buildVideoDurationOptions(model, constraints)).toEqual([5, 7, 9])
		expect(getVideoDurationConfig(model, constraints)).toEqual({ type: "options" })
		expect(resolveVideoDefaultDuration(model, constraints)).toBe(9)
	})
})
