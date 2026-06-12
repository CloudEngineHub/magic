import {
	DEFAULT_AUDIO_SETTING_TOPIC_ID,
	DEFAULT_RECORDING_SETTINGS,
} from "../constants/recording-settings"
import type {
	RecordingSettings,
	RecordingSettingsApiPayload,
	RecordingTopicModelResponse,
} from "../types/recording-settings"

/** Maps API response to UI settings, applying defaults and Android-compatible extra.model fallback */
export function apiResponseToSettings(
	response: RecordingTopicModelResponse,
	fallbackModelId: string,
): RecordingSettings {
	return {
		transcription_enabled:
			response.extra?.transcription_enabled ??
			DEFAULT_RECORDING_SETTINGS.transcription_enabled,
		auto_summary_enabled:
			response.extra?.auto_summary_enabled ?? DEFAULT_RECORDING_SETTINGS.auto_summary_enabled,
		model_id: response.extra?.model?.model_id || response.model?.model_id || fallbackModelId,
	}
}

/** Builds PUT payload with Android-compatible extra.model while preserving top-level model fallback */
export function settingsToApiPayload(
	settings: RecordingSettings,
	cachedResponse: RecordingTopicModelResponse,
): RecordingSettingsApiPayload {
	const selectedModel = { ...(cachedResponse.extra?.model ?? {}), model_id: settings.model_id }

	return {
		cache_id: DEFAULT_AUDIO_SETTING_TOPIC_ID,
		model_id: settings.model_id,
		image_model_id: cachedResponse.image_model?.model_id,
		video_model_id: cachedResponse.video_model?.model_id,
		extra: {
			transcription_enabled: settings.transcription_enabled,
			auto_summary_enabled: settings.auto_summary_enabled,
			model: selectedModel,
		},
	}
}
