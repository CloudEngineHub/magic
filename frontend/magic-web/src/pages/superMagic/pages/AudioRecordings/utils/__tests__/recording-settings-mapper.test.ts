import { describe, expect, it } from "vitest"
import { DEFAULT_AUDIO_SETTING_TOPIC_ID } from "../../constants/recording-settings"
import { apiResponseToSettings, settingsToApiPayload } from "../recording-settings-mapper"

const MOCK_FALLBACK_MODEL = "mock-fallback-model"

describe("recording-settings-mapper", () => {
	it("applies defaults when extra fields are missing", () => {
		const settings = apiResponseToSettings({}, MOCK_FALLBACK_MODEL)

		expect(settings).toEqual({
			transcription_enabled: true,
			auto_summary_enabled: true,
			model_id: MOCK_FALLBACK_MODEL,
		})
	})

	it("builds PUT payload with managed extra fields and Android-compatible model", () => {
		const payload = settingsToApiPayload(
			{
				transcription_enabled: false,
				auto_summary_enabled: true,
				model_id: "mock-selected-model",
			},
			{
				image_model: { model_id: "mock-image-model" },
				video_model: { model_id: "mock-video-model" },
			},
		)

		expect(payload).toEqual({
			cache_id: DEFAULT_AUDIO_SETTING_TOPIC_ID,
			model_id: "mock-selected-model",
			image_model_id: "mock-image-model",
			video_model_id: "mock-video-model",
			extra: {
				transcription_enabled: false,
				auto_summary_enabled: true,
				model: {
					model_id: "mock-selected-model",
				},
			},
		})
	})

	it("prefers Android-compatible extra.model before top-level model", () => {
		const settings = apiResponseToSettings(
			{
				model: { model_id: "mock-top-level-model" },
				extra: {
					model: { model_id: "mock-extra-model" },
				},
			},
			MOCK_FALLBACK_MODEL,
		)

		expect(settings.model_id).toBe("mock-extra-model")
	})
})
