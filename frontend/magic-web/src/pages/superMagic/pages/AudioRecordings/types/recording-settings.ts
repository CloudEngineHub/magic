import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"

export interface RecordingSettings {
	transcription_enabled: boolean
	auto_summary_enabled: boolean
	model_id: string
}

export interface RecordingSettingsApiExtra {
	transcription_enabled?: boolean
	auto_summary_enabled?: boolean
	model?: Partial<ModelItem>
}

export interface RecordingTopicModelResponse {
	model?: Partial<ModelItem>
	image_model?: Partial<ModelItem>
	video_model?: Partial<ModelItem>
	extra?: RecordingSettingsApiExtra
}

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
