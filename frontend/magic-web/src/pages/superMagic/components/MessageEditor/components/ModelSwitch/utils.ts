import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"
import { ModelItem, ModelStatusEnum, ModelTagEnum, ReasoningEffort } from "./types"

interface ResolveShowSelectedModelNameOptions {
	showSelectedModelName: boolean
	showImageTab: boolean
	showVideoTab: boolean
}

export function resolveShowSelectedModelName({
	showSelectedModelName,
	showImageTab,
	showVideoTab,
}: ResolveShowSelectedModelNameOptions): boolean {
	return showSelectedModelName || (!showImageTab && !showVideoTab)
}

export function isMaxModel(model?: ModelItem): boolean {
	if (!model) return false
	return (model.model_name || model.model_id).toLocaleLowerCase() === "max"
}

export function isAutoModel(model?: ModelItem): boolean {
	if (!model) return false
	return (model.model_name || model.model_id).toLocaleLowerCase() === "auto"
}

export function isQwenCoderPlusModel(model?: ModelItem): boolean {
	if (!model) return false
	return model.model_id.toLocaleLowerCase() === "qwen3-coder-plus"
}

export function isGemini3FlashModel(model?: ModelItem): boolean {
	if (!model) return false
	return model.model_id.toLocaleLowerCase() === "gemini-3-flash-preview"
}

/** Resolve the visible reasoning preference without replacing an explicit default with a stale cache value. */
export function getModelReasoningEffort(model?: ModelItem | null): ReasoningEffort | undefined {
	if (!model?.reasoning_effort_levels?.length) return undefined
	if (Object.prototype.hasOwnProperty.call(model, "reasoning_effort")) {
		return model.reasoning_effort ?? undefined
	}
	return modelCache.getReasoningEffort(model)
}

/**
 * Check if a model has a specific tag
 * @param model - The model to check
 * @param tag - The tag to look for
 * @returns true if the model has the tag
 */
export function hasModelTag(model: ModelItem, tag: ModelTagEnum): boolean {
	return model.tags?.includes(tag) ?? false
}

/**
 * Check if a model is disabled based on its status
 * @param model - The model to check
 * @returns true if the model status is Disabled or Deleted
 */
export function isModelDisabled(model: ModelItem): boolean {
	return [ModelStatusEnum.Disabled, ModelStatusEnum.Deleted].includes(model.model_status)
}
