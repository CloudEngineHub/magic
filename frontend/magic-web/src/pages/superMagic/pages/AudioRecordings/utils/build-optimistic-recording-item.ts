import type { AudioProjectListItem } from "@/types/audioProject"

interface BuildOptimisticRecordingItemParams {
	projectId: string
	projectName: string
	workspaceId?: string
	modelId: string
	duration?: number
	audioFileId?: string
	taskKey?: string
	audioSource?: "recorded" | "imported"
	topicId?: string
	source?: string | null
	/** When false, card stays in merging-completed / not_summarized until user taps Generate Summary */
	autoSummaryEnabled?: boolean
}

/**
 * Builds a stable recording list item so the list can immediately show a
 * "summarizing" card before the backend query catches up.
 * Kept in utils (not the entry facade hook) so stores can reuse it without a hook↔store cycle.
 */
export function buildOptimisticRecordingItem(
	params: BuildOptimisticRecordingItemParams,
): AudioProjectListItem {
	const autoSummaryEnabled = params.autoSummaryEnabled ?? true

	return {
		id: params.projectId,
		project_name: params.projectName,
		// Use unix seconds to match the API contract (created_at is always seconds-based).
		// Date.now() returns milliseconds which would cause parseAudioProjectTimestamp to
		// treat the value as ~57000 AD, breaking the relative time display.
		created_at: Math.floor(Date.now() / 1000),
		duration: params.duration ?? 0,
		tags: [],
		device_id: "",
		audio_source: params.audioSource ?? "recorded",
		current_phase: autoSummaryEnabled ? "summarizing" : "merging",
		phase_status: autoSummaryEnabled ? "in_progress" : "completed",
		card_status: autoSummaryEnabled ? "summarizing" : "not_summarized",
		is_summarized: false,
		workspace_id: params.workspaceId ?? null,
		workspace_name: null,
		model_id: params.modelId,
		audio_file_id: params.audioFileId,
		task_key: params.taskKey,
		topic_id: params.topicId,
		source: params.source ?? null,
	}
}
