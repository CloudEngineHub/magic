import { audioRecordingsService } from "@/services/audioRecordings/AudioRecordingsService"
import type { AudioProjectListItem } from "@/types/audioProject"
import { canSubmitResummary, canSubmitSummary } from "./summary-action-utils"

export type SubmitAudioRecordingSummaryResult =
	| { ok: true }
	| { ok: false; reason: "missingParams" | "missingModel" | "api" }

/** Validates and submits a summary request using the shared recordings service contract. */
export async function submitAudioRecordingSummary(
	item: AudioProjectListItem,
): Promise<SubmitAudioRecordingSummaryResult> {
	if (
		!canSubmitSummary({
			task_key: item.task_key,
			topic_id: item.topic_id,
			audio_file_id: item.audio_file_id,
			audio_source: item.audio_source,
		})
	) {
		return { ok: false, reason: "missingParams" }
	}

	const modelId = await audioRecordingsService.resolveModelIdForSubmit(item.model_id)
	if (!modelId) return { ok: false, reason: "missingModel" }

	try {
		await audioRecordingsService.submitSummary(item, modelId)
		return { ok: true }
	} catch {
		return { ok: false, reason: "api" }
	}
}

/** Validates and submits a re-summary request using the shared recordings service contract. */
export async function resubmitAudioRecordingSummary(
	item: AudioProjectListItem,
): Promise<SubmitAudioRecordingSummaryResult> {
	if (!canSubmitResummary({ task_key: item.task_key })) {
		return { ok: false, reason: "missingParams" }
	}

	const modelId = await audioRecordingsService.resolveModelIdForSubmit(item.model_id)
	if (!modelId) return { ok: false, reason: "missingModel" }

	try {
		await audioRecordingsService.resubmitSummary(item, modelId)
		return { ok: true }
	} catch {
		return { ok: false, reason: "api" }
	}
}

/** Builds the optimistic list/detail item state that represents an in-progress summary task. */
export function buildOptimisticSummarizingProject(
	item: AudioProjectListItem,
): AudioProjectListItem {
	return {
		...item,
		current_phase: "summarizing",
		phase_status: "in_progress",
		card_status: "summarizing",
		is_summarized: false,
	}
}

/** Persists a project rename through the shared recordings service. */
export async function renameAudioRecordingProject(projectId: string, name: string): Promise<void> {
	await audioRecordingsService.renameProject(projectId, name)
}

/** Deletes one or more recording projects through the shared recordings service. */
export async function deleteAudioRecordingProjects(projectIds: string[]): Promise<void> {
	await audioRecordingsService.batchDeleteProjects(projectIds)
}

/** Moves one or more recording projects to a destination group through the shared recordings service. */
export async function moveAudioRecordingProjects(
	projectIds: string[],
	targetWorkspaceId: string,
): Promise<void> {
	await audioRecordingsService.batchMoveProjects(projectIds, targetWorkspaceId)
}
