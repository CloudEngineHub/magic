import type {
	AudioProjectApiItem,
	AudioProjectListItem,
	AudioRecordingCardStatus,
} from "@/types/audioProject"
import { coerceIdToString } from "./summary-action-utils"

/** Mirrors Android client: upload/merge pipeline still in progress */
export function resolveIsProcessingComplete(
	currentPhase: string | null,
	phaseStatus: string | null,
): boolean {
	if (currentPhase === "waiting") return false
	if (currentPhase === "merging" && phaseStatus === "in_progress") return false
	if (currentPhase === "merging" && phaseStatus === "failed") return false
	return true
}

/** Whether the item should appear on the PC recordings list */
export function isPcListVisible(currentPhase: string | null, phaseStatus: string | null): boolean {
	return resolveIsProcessingComplete(currentPhase, phaseStatus)
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

	// 2. Completed states
	if (raw.is_summarized === 1) return "summarized"
	if (raw.project_status === "finished") return "summarized"
	if (raw.current_topic_status === "finished") return "summarized"
	if (currentPhase === "summarizing" && phaseStatus === "completed") return "summarized"

	// 3. Summarizing failed or ongoing
	if (currentPhase === "summarizing") {
		if (phaseStatus === "failed") return "summary_failed"
		return "summarizing"
	}

	// 4. Audio merging phase
	if (currentPhase === "merging") {
		if (phaseStatus === "completed") return "not_summarized"
		return "merging"
	}
	if (currentPhase === "waiting") {
		return "merging"
	}

	return "not_summarized"
}

/** Maps raw API list item into a stable UI view model; returns null when still in APP processing */
export function normalizeAudioProjectListItem(
	raw: AudioProjectApiItem & {
		transferStatus?: "transferring" | "failed" | "done" | "queued" | null
	},
): AudioProjectListItem | null {
	const extra = raw.extra ?? {}
	const currentPhase = extra.current_phase ?? null
	const phaseStatus = extra.phase_status ?? null

	if (!isPcListVisible(currentPhase, phaseStatus)) return null

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
		duration: extra.duration ?? raw.duration ?? 0,
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

/** Normalizes an API list response batch and drops APP-side processing items */
export function normalizeAudioProjectList(items: AudioProjectApiItem[]): AudioProjectListItem[] {
	return items
		.map(normalizeAudioProjectListItem)
		.filter((item): item is AudioProjectListItem => item != null)
}
