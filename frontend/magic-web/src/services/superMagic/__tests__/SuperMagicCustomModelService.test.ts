import { beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_TYPE_LLM, MODEL_TYPE_VIDEO } from "@/apis/modules/org-ai-model-provider"
import type { ServiceProviderModel } from "@/apis/modules/org-ai-model-provider"

const { queryServiceProviderModels } = vi.hoisted(() => ({
	queryServiceProviderModels: vi.fn(),
}))

vi.mock("@/apis", () => ({
	OrgAiModelProviderApi: {
		queryServiceProviderModels,
	},
}))

import superMagicCustomModelService from "../SuperMagicCustomModelService"

describe("SuperMagicCustomModelService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		superMagicCustomModelService.clearCache()
	})

	it("filters custom video models by backend model_type 5", async () => {
		expect(MODEL_TYPE_VIDEO).toBe(5)

		const videoModel = {
			id: "video-1",
			name: "Custom Video Model",
			model_id: "custom-video",
			model_version: "custom-video-v1",
			model_type: 5,
			category: "video",
			description: "Custom video model",
			icon: "",
			service_provider_config_id: "provider-video",
			service_provider_config: {
				id: "provider-video",
				name: "Custom Video Provider",
			},
		} satisfies ServiceProviderModel

		const languageModel = {
			id: "llm-1",
			name: "Custom Language Model",
			model_id: "custom-llm",
			model_version: "custom-llm-v1",
			model_type: MODEL_TYPE_LLM,
			category: "llm",
			description: "Custom language model",
			icon: "",
			service_provider_config_id: "provider-llm",
			service_provider_config: {
				id: "provider-llm",
				name: "Custom Language Provider",
			},
		} satisfies ServiceProviderModel

		queryServiceProviderModels.mockResolvedValue({
			list: [videoModel, languageModel],
		})

		const models = await superMagicCustomModelService.getMyModelsByType(MODEL_TYPE_VIDEO)

		expect(models).toHaveLength(1)
		expect(models[0]?.model_id).toBe("custom-video")
		expect(queryServiceProviderModels).toHaveBeenCalledTimes(1)
	})
})
