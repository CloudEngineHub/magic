import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import type { ModelItem } from "../../types"
import { MessageSendModelWaitError, resolveMessageSendModels } from "../messageSendModelFallback"

describe("resolveMessageSendModels", () => {
	const languageModel: ModelItem = {
		id: "model-1",
		group_id: "group-1",
		model_id: "model-1",
		model_name: "Model 1",
		provider_model_id: "model-1",
		model_description: "Model 1",
		model_icon: "",
		model_status: "normal",
		sort: 1,
	}
	const imageModel: ModelItem = {
		...languageModel,
		id: "image-model-1",
		model_id: "image-model-1",
		model_name: "Image Model 1",
	}
	const videoModel: ModelItem = {
		...languageModel,
		id: "video-model-1",
		model_id: "video-model-1",
		model_name: "Video Model 1",
	}

	let topicModelStore: ReturnType<typeof createSuperMagicTopicModelStore>

	beforeEach(() => {
		topicModelStore = createSuperMagicTopicModelStore()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("waits for all topic models before resolving", async () => {
		topicModelStore.setLoading(true)
		const resultPromise = resolveMessageSendModels({ topicModelStore })

		topicModelStore.setSelectedLanguageModel(languageModel)
		topicModelStore.setSelectedImageModel(imageModel)
		topicModelStore.setSelectedVideoModel(videoModel)
		topicModelStore.setLoading(false)

		await expect(resultPromise).resolves.toEqual({
			selectedModel: languageModel,
			selectedImageModel: imageModel,
			selectedVideoModel: videoModel,
		})
	})

	it("allows optional image and video models to remain empty", async () => {
		topicModelStore.setSelectedLanguageModel(languageModel)

		await expect(resolveMessageSendModels({ topicModelStore })).resolves.toEqual({
			selectedModel: languageModel,
			selectedImageModel: null,
			selectedVideoModel: null,
		})
	})

	it("returns null when loading finishes without a language model", async () => {
		topicModelStore.setLoading(true)
		const resultPromise = resolveMessageSendModels({ topicModelStore })

		topicModelStore.setSelectedImageModel(imageModel)
		topicModelStore.setSelectedVideoModel(videoModel)
		topicModelStore.setLoading(false)

		await expect(resultPromise).resolves.toBeNull()
	})

	it("preserves explicitly selected models after loading", async () => {
		topicModelStore.setLoading(true)
		const resultPromise = resolveMessageSendModels({
			topicModelStore,
			selectedModel: languageModel,
			selectedImageModel: imageModel,
			selectedVideoModel: videoModel,
		})

		topicModelStore.setSelectedLanguageModel({
			...languageModel,
			model_id: "topic-default-model",
		})
		topicModelStore.setLoading(false)

		await expect(resultPromise).resolves.toEqual({
			selectedModel: languageModel,
			selectedImageModel: imageModel,
			selectedVideoModel: videoModel,
		})
	})

	it("rejects with a recognizable error when model loading times out", async () => {
		vi.useFakeTimers()
		topicModelStore.setLoading(true)
		const resultPromise = resolveMessageSendModels({
			topicModelStore,
			waitTimeoutMs: 1_000,
		})
		const assertion = expect(resultPromise).rejects.toEqual(
			expect.objectContaining<MessageSendModelWaitError>({
				name: "MessageSendModelWaitError",
				reason: "timeout",
			}),
		)

		await vi.advanceTimersByTimeAsync(1_000)
		await assertion
	})

	it("rejects with an aborted error when the caller cancels waiting", async () => {
		topicModelStore.setLoading(true)
		const controller = new AbortController()
		const resultPromise = resolveMessageSendModels({
			topicModelStore,
			signal: controller.signal,
		})
		const assertion = expect(resultPromise).rejects.toEqual(
			expect.objectContaining<MessageSendModelWaitError>({
				name: "MessageSendModelWaitError",
				reason: "aborted",
			}),
		)

		controller.abort()
		await assertion
	})
})
