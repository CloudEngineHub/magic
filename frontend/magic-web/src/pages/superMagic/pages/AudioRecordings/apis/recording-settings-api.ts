import { SuperMagicApi } from "@/apis"
import { DEFAULT_AUDIO_SETTING_TOPIC_ID } from "../constants/recording-settings"
import type {
	RecordingSettingsApiPayload,
	RecordingTopicModelResponse,
} from "../types/recording-settings"

/**
 * Fetches persisted default_audio topic-model settings including extra fields.
 */
export function getRecordingTopicModel(): Promise<RecordingTopicModelResponse> {
	return SuperMagicApi.getSuperMagicTopicModel({
		topic_id: DEFAULT_AUDIO_SETTING_TOPIC_ID,
	}) as Promise<RecordingTopicModelResponse>
}

/**
 * Persists default_audio settings; merges model + extra without dropping image/video models.
 */
export function saveRecordingTopicModel(payload: RecordingSettingsApiPayload) {
	const { cache_id, model_id, image_model_id, video_model_id, extra } = payload

	return SuperMagicApi.saveSuperMagicTopicModel({
		cache_id: cache_id || DEFAULT_AUDIO_SETTING_TOPIC_ID,
		model_id,
		image_model_id,
		video_model_id,
		extra,
	})
}
