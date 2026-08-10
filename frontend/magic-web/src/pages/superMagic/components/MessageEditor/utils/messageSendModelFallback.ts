import { when } from "mobx"
import type { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import type { ModelItem } from "../types"

type TopicModelStore = ReturnType<typeof createSuperMagicTopicModelStore>

interface ResolveMessageSendModelsParams {
	topicModelStore: TopicModelStore
	selectedModel?: ModelItem | null
	selectedImageModel?: ModelItem | null
	selectedVideoModel?: ModelItem | null
}

export interface ResolvedMessageSendModels {
	selectedModel: ModelItem
	selectedImageModel: ModelItem | null
	selectedVideoModel: ModelItem | null
}

export async function resolveMessageSendModels({
	topicModelStore,
	selectedModel,
	selectedImageModel,
	selectedVideoModel,
}: ResolveMessageSendModelsParams): Promise<ResolvedMessageSendModels | null> {
	if (topicModelStore.isLoading) {
		await when(() => !topicModelStore.isLoading)
	}

	if (!topicModelStore.isLanguageModelReady) return null

	const languageModel = selectedModel ?? topicModelStore.selectedLanguageModel
	if (!languageModel?.model_id) return null

	return {
		selectedModel: languageModel,
		selectedImageModel: selectedImageModel ?? topicModelStore.selectedImageModel,
		selectedVideoModel: selectedVideoModel ?? topicModelStore.selectedVideoModel,
	}
}
