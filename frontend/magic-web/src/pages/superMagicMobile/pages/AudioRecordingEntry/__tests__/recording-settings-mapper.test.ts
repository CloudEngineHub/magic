import { describe, expect, it } from "vitest"
import { DEFAULT_AUDIO_SETTING_TOPIC_ID } from "../constants/recording-settings"
import { apiResponseToSettings, settingsToApiPayload } from "../utils/recording-settings-mapper"

const MOCK_FALLBACK_MODEL = "mock-fallback-model"

describe("mobile-recording-settings-mapper-proxy", () => {
	it("applies defaults when extra fields are missing", () => {
		const settings = apiResponseToSettings({}, MOCK_FALLBACK_MODEL)

		expect(settings).toEqual({
			transcription_enabled: true,
			auto_summary_enabled: true,
			model_id: MOCK_FALLBACK_MODEL,
		})
	})

	it("builds PUT payload with managed extra fields", () => {
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
})
