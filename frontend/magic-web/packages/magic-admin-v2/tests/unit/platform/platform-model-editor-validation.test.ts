import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { providerModelType } from "@magic-admin-v2/features/platform-model-list/types";
import {
  modelEditorSchema,
  type ModelEditorValues,
} from "@magic-admin-v2/features/platform-model-list/utils/model-editor-schema";

function createValues(overrides: Partial<ModelEditorValues> = {}): ModelEditorValues {
  return {
    model_id: "gpt-test",
    name: "测试模型",
    name_en: "Test model",
    icon: "",
    description: "",
    description_en: "",
    category: "llm",
    model_type: providerModelType.largeLanguageModel,
    max_tokens: "128000",
    max_output_tokens: "4096",
    vector_size: "",
    temperature_mode: "recommended",
    temperature: "0.7",
    support_function: true,
    support_multi_modal: true,
    support_deep_think: false,
    providers: [
      {
        client_key: "binding-1",
        provider_code: "openai",
        service_provider_config_id: "provider-1",
        model_version: "gpt-test",
        enabled: true,
        billing_currency: "CNY",
        billing_type: "token",
        pricing_template: null,
        pricing_entries: {},
        billing_tiers: [],
        legacy_pricing: {},
        load_balancing_weight: "",
        extra_header: "",
        extra_body: "",
      },
    ],
    ...overrides,
  };
}

describe("platform model editor validation", () => {
  it("requires maximum context tokens for non-embedding models", () => {
    const result = modelEditorSchema.safeParse(createValues({ max_tokens: "" }));

    assert.equal(result.success, false);
    if (result.success) return;

    assert.equal(
      result.error.issues.find((issue) => issue.path.join(".") === "max_tokens")?.message,
      "请输入最大上下文 Tokens。",
    );
  });

  it("does not require maximum context tokens for embedding, image, or video models", () => {
    [
      providerModelType.embedding,
      providerModelType.textToImage,
      providerModelType.textToVideo,
    ].forEach((model_type) => {
      const result = modelEditorSchema.safeParse(
        createValues({
          model_type,
          max_tokens: "",
        }),
      );

      assert.equal(result.success, true, `model type ${model_type} should not require max_tokens`);
    });
  });
});
