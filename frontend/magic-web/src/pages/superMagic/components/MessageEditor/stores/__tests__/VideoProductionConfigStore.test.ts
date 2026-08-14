import { describe, expect, it } from "vitest"
import type { ModelItem } from "../../components/ModelSwitch/types"
import { ModelStatusEnum } from "../../components/ModelSwitch/types"
import {
	VideoProductionConfigStore,
	resolveVideoProductionCapabilities,
} from "../VideoProductionConfigStore"

function createModel(
	modelId: string,
	generation: NonNullable<NonNullable<ModelItem["video_generation_config"]>["generation"]>,
): ModelItem {
	return {
		id: modelId,
		group_id: "group",
		model_id: modelId,
		model_name: modelId,
		provider_model_id: modelId,
		model_description: "",
		model_icon: "",
		model_status: ModelStatusEnum.Normal,
		sort: 0,
		video_generation_config: { generation },
	}
}

describe("VideoProductionConfigStore", () => {
	it("resolves sizes, defaults, and range durations", () => {
		const model = createModel("range-model", {
			aspect_ratios: ["16:9", "9:16"],
			durations: { min: 4, max: 30, step: 1 },
			duration_type: "range",
			default_duration_seconds: 5,
			resolutions: ["480p", "720p"],
			default_resolution: "720p",
			sizes: [
				{ label: "16:9", value: "1280x720", width: 1280, height: 720, resolution: "720p" },
			],
		})
		const capabilities = resolveVideoProductionCapabilities({ model, inputMode: "standard" })

		expect(capabilities.showAspectRatio).toBe(true)
		expect(capabilities.defaults).toMatchObject({
			aspectRatio: "16:9",
			resolution: "720p",
			durationSeconds: 5,
		})
		expect(capabilities.duration).toMatchObject({ type: "range", min: 4, max: 30, step: 1 })
		expect(capabilities.aspectRatioOptions.map((item) => item.value)).toEqual(["16:9"])
	})

	it("hides capability controls when the model has no generation config", () => {
		const model = {
			...createModel("without-config", { durations: [] }),
			video_generation_config: undefined,
		}
		const capabilities = resolveVideoProductionCapabilities({ model, inputMode: "standard" })

		expect(capabilities).toMatchObject({
			showAspectRatio: false,
			showDuration: false,
			showResolution: false,
			skillOptions: [],
		})
	})

	it("filters sizes and durations by standard input mode constraints", () => {
		const model = createModel("constrained-model", {
			aspect_ratios: ["16:9", "9:16"],
			durations: [5, 10, 15],
			resolutions: ["720p", "1080p"],
			sizes: [
				{ label: "16:9", value: "1280x720", width: 1280, height: 720, resolution: "720p" },
				{
					label: "9:16",
					value: "1080x1920",
					width: 1080,
					height: 1920,
					resolution: "1080p",
				},
			],
		})
		model.video_generation_config = {
			...model.video_generation_config,
			input_modes: {
				standard: {
					generation_constraints: {
						resolutions: ["1080p"],
						durations: [15],
					},
				},
			},
		}
		const capabilities = resolveVideoProductionCapabilities({ model, inputMode: "standard" })

		expect(capabilities.resolutionOptions.map((item) => item.value)).toEqual(["1080p"])
		expect(capabilities.aspectRatioOptions.map((item) => item.value)).toEqual(["9:16"])
		expect(capabilities.duration).toMatchObject({ type: "options", options: [15] })
	})

	it("resets to the active model defaults when switching models", () => {
		const modelA = createModel("model-a", {
			aspect_ratios: ["16:9"],
			durations: [4, 8],
			resolutions: ["720p"],
		})
		const modelB = createModel("model-b", {
			aspect_ratios: ["9:16"],
			durations: [6],
			resolutions: ["1080p"],
		})
		const store = new VideoProductionConfigStore()
		store.setContext({ model: modelA })
		store.setConfig({ durationSeconds: 8 })
		store.setContext({ model: modelB })
		expect(store.config).toMatchObject({
			aspectRatio: "9:16",
			durationSeconds: 6,
			resolution: "1080p",
		})
		store.setContext({ model: modelA })
		expect(store.config.durationSeconds).toBe(4)
	})

	it("does not restore a prior selection after recreating the store", () => {
		const model = createModel("model-a", {
			aspect_ratios: ["16:9"],
			durations: [5, 10],
			resolutions: ["720p"],
		})
		const store = new VideoProductionConfigStore()
		store.setContext({ model })
		store.setConfig({ generationMode: "detailed", durationSeconds: 10 })

		const nextStore = new VideoProductionConfigStore()
		nextStore.setContext({ model })
		expect(nextStore.config).toMatchObject({ generationMode: "normal", durationSeconds: 5 })

		store.clearCurrentConfig()
		expect(store.config.durationSeconds).toBe(5)
	})
})
