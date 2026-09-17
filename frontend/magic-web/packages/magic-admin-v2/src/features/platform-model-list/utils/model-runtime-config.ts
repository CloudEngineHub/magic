import {
  providerModelType,
  type ProviderModelType,
} from "@magic-admin-v2/features/platform-model-list/types";

/**
 * Embedding is persisted under the LLM category, so runtime behavior must be
 * derived from model_type instead of the backend-facing category value.
 */
export function isEmbeddingModelType(modelType: ProviderModelType) {
  return modelType === providerModelType.embedding;
}

/** Image and video models do not expose the shared LLM runtime parameters. */
export function hasCommonRuntimeFields(modelType: ProviderModelType) {
  return modelType === providerModelType.largeLanguageModel || isEmbeddingModelType(modelType);
}

export function getCommonRuntimeFieldVisibility(modelType: ProviderModelType) {
  const isEmbedding = isEmbeddingModelType(modelType);
  const hasRuntimeFields = hasCommonRuntimeFields(modelType);

  return {
    capabilities: hasRuntimeFields && !isEmbedding,
    maxOutputTokens: hasRuntimeFields,
    maxTokens: hasRuntimeFields && !isEmbedding,
    temperature: hasRuntimeFields,
    vectorSize: hasRuntimeFields && isEmbedding,
  };
}
