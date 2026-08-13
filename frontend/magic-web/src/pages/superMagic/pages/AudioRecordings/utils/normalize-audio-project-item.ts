import type {
	AudioProjectApiItem,
	AudioProjectListItem,
	AudioRecordingCardStatus,
} from "@/types/audioProject"
import { coerceIdToString } from "./summary-action-utils"

/** Picks the first hydrated duration field while letting duration_seconds fill early backend rows */
function resolveAudioProjectDuration(raw: AudioProjectApiItem): number {
	const candidates = [
		raw.extra?.duration,
		raw.extra?.duration_seconds,
		raw.duration,
		raw.duration_seconds,
	]
	const positiveDuration = candidates.find(
		(value) => Number.isFinite(value) && value !== undefined && value > 0,
	)
	if (positiveDuration != null) return positiveDuration

	const explicitZeroDuration = candidates.find((value) => value === 0)
	return explicitZeroDuration ?? 0
}

/** Resolves PC card status for items that passed the processing-complete gate */
export function resolveCardStatus(
	raw: Pick<AudioProjectApiItem, "project_status" | "current_topic_status" | "is_summarized">,
	currentPhase: string | null,
	phaseStatus: string | null = null,
	transferStatus?: "transferring" | "failed" | "done" | "queued" | null,
): AudioRecordingCardStatus {
	// 1. Local front-end transfer statuses
	if (transferStatus === "transferring") return "uploading"
	if (transferStatus === "failed") return "upload_failed"

	// 2. Active summarizing states must win over stale finished flags from a previous summary.
	if (currentPhase === "summarizing") {
		if (phaseStatus === "completed") return "summarized"
		if (phaseStatus === "failed") return "summary_failed"
		return "summarizing"
	}

	// 3. Keep the explicit legacy summary flag for older flat API responses.
	if (raw.is_summarized === 1) return "summarized"

	// 4. Audio merging phase
	if (currentPhase === "waiting") {
		// Waiting is distinct from merge-in-progress so the shared card can explain
		// that the backend has accepted the task but has not started processing yet.
		return "waiting"
	}
	if (currentPhase === "merging") {
		if (phaseStatus === "in_progress") return "processing"
		if (phaseStatus === "failed") return "merge_failed"
		if (phaseStatus === "completed") return "not_summarized"
		return "merging"
	}

	return "not_summarized"
}

/** Maps raw API list item into a stable UI view model; returns null only for hidden pipeline states */
export function normalizeAudioProjectListItem(
	raw: AudioProjectApiItem & {
		transferStatus?: "transferring" | "failed" | "done" | "queued" | null
	},
): AudioProjectListItem | null {
	const extra = raw.extra ?? {}
	const currentPhase = extra.current_phase ?? null
	const phaseStatus = extra.phase_status ?? null

	const createdAt =
		raw.created_at ?? (raw.create_timestamp ? Number(raw.create_timestamp) : undefined) ?? 0
	const cardStatus = resolveCardStatus(
		{
			project_status: raw.project_status,
			current_topic_status: raw.current_topic_status,
			is_summarized: raw.is_summarized,
		},
		currentPhase,
		phaseStatus,
		raw.transferStatus,
	)

	return {
		id: raw.id,
		project_name: raw.project_name,
		created_at: Number.isFinite(createdAt) ? createdAt : 0,
		duration: resolveAudioProjectDuration(raw),
		tags: extra.tags ?? raw.tags ?? [],
		device_id: extra.device_id ?? raw.device_id ?? "",
		audio_source: extra.audio_source ?? null,
		current_phase: currentPhase,
		phase_status: phaseStatus,
		phase_percent: extra.phase_percent,
		card_status: cardStatus,
		is_summarized: cardStatus === "summarized",
		project_status: raw.project_status,
		current_topic_status: raw.current_topic_status,
		workspace_id: raw.workspace_id ?? null,
		workspace_name: raw.workspace_name ?? null,
		task_key: extra.task_key,
		topic_id: coerceIdToString(extra.topic_id),
		audio_file_id: coerceIdToString(extra.audio_file_id),
		model_id: coerceIdToString(extra.model_id ?? undefined),
		transcription_enabled: extra.transcription_enabled,
		source: extra.source ?? null,
		transferStatus: raw.transferStatus ?? undefined,
	}
}

/** Recomputes card_status after a progress patch without re-fetching the full list */
export function resolveCardStatusFromListItem(
	item: Pick<
		AudioProjectListItem,
		| "current_phase"
		| "phase_status"
		| "project_status"
		| "current_topic_status"
		| "is_summarized"
		| "transferStatus"
	>,
): AudioRecordingCardStatus {
	const rawLike = {
		project_status: item.project_status,
		current_topic_status: item.current_topic_status,
		is_summarized: item.is_summarized ? 1 : 0,
	}
	return resolveCardStatus(rawLike, item.current_phase, item.phase_status, item.transferStatus)
}

/** Normalizes an API list response batch and drops only hidden pipeline items */
export function normalizeAudioProjectList(items: AudioProjectApiItem[]): AudioProjectListItem[] {
	return items
		.map(normalizeAudioProjectListItem)
		.filter((item): item is AudioProjectListItem => item != null)
}
