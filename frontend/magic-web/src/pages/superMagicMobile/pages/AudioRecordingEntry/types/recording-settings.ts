import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"

/** Mobile recording settings UI state (3 fields only) */
export interface RecordingSettings {
	transcription_enabled: boolean
	auto_summary_enabled: boolean
	model_id: string
}

/** Server-side extra payload aligned with Android field names */
export interface RecordingSettingsApiExtra {
	transcription_enabled?: boolean
	auto_summary_enabled?: boolean
	model?: Partial<ModelItem>
}

/** GET topic-model/default_audio response shape */
export interface RecordingTopicModelResponse {
	model?: Partial<ModelItem>
	image_model?: Partial<ModelItem>
	video_model?: Partial<ModelItem>
	extra?: RecordingSettingsApiExtra
}

/** PUT topic-model/default_audio request body */
export interface RecordingSettingsApiPayload {
	cache_id: string
	model_id?: string
	image_model_id?: string
	video_model_id?: string
	extra?: RecordingSettingsApiExtra
}

export type RecordingSettingsKey = keyof Pick<
	RecordingSettings,
	"transcription_enabled" | "auto_summary_enabled" | "model_id"
>
