import type { AudioProjectAudioSource, AudioRecordingCardStatus } from "@/types/audioProject"

export type SummaryButtonVariant = "generate" | "retry"

export interface SummarySubmitExtra {
	task_key?: string
	topic_id?: string
	audio_file_id?: string
	audio_source?: AudioProjectAudioSource | null
	model_id?: string
}

export interface DetailSummaryActionEligibilityInput {
	phase: string | null
	status: string | null
	isSubmitting?: boolean
	extra: SummarySubmitExtra
}

export type DetailSummaryVisualStatus =
	| "ready"
	| "pending"
	| "generating"
	| "failed"
	| "unavailable"

export interface DetailSummaryVisualStateInput extends DetailSummaryActionEligibilityInput {
	summaryReady: boolean
	cardStatus?: AudioRecordingCardStatus | null
}

export interface DetailSummaryVisualState {
	status: DetailSummaryVisualStatus
	canGenerate: boolean
	buttonVariant: SummaryButtonVariant | null
}

/**
 * Coerces API ids to strings for ASR request bodies.
 * Large snowflake integers must be quoted at JSON parse time — unsafe numbers are already corrupted.
 */
export function coerceIdToString(value: string | number | null | undefined): string | undefined {
	if (value == null || value === "") return undefined
	if (typeof value === "number" && !Number.isSafeInteger(value)) {
		console.warn(
			"[audioRecordings] coerceIdToString received an unsafe integer; enable parseJsonLargeIntAsString on the API request",
		)
	}
	return String(value)
}

/** Whether the list card should render a summary action button */
export function shouldShowSummaryButton(phase: string | null, status: string | null): boolean {
	if (!phase || !status) return false
	if (phase === "merging" && status === "completed") return true
	if (phase === "summarizing" && status === "failed") return true
	return false
}

/** Whether the summary button is interactive (not disabled by in-flight submit) */
export function canClickSummaryButton(
	phase: string | null,
	status: string | null,
	isSubmitting = false,
): boolean {
	if (isSubmitting) return false
	if (!phase || !status) return false
	if (phase === "summarizing" && status === "in_progress") return false
	if (phase === "merging" && status === "completed") return true
	if (phase === "summarizing" && status === "failed") return true
	return false
}

/** Resolves which summary button label variant to show */
export function getSummaryButtonVariant(
	phase: string | null,
	status: string | null,
): SummaryButtonVariant | null {
	if (phase === "summarizing" && status === "failed") return "retry"
	if (phase === "merging" && status === "completed") return "generate"
	return null
}

/** Validates required fields before calling summarize APIs */
export function canSubmitSummary(extra: SummarySubmitExtra): boolean {
	if (!extra.task_key || !extra.topic_id) return false
	if (extra.audio_source === "imported" && !extra.audio_file_id) return false
	return true
}

/** Reuses the card CTA rules so detail header visibility never drifts from the list behavior. */
export function canGenerateSummaryFromDetail(input: DetailSummaryActionEligibilityInput): boolean {
	const { phase, status, isSubmitting = false, extra } = input
	if (!canSubmitSummary(extra)) return false
	if (!shouldShowSummaryButton(phase, status)) return false
	return canClickSummaryButton(phase, status, isSubmitting)
}

/** Resolves the owner detail summary placeholder state without allowing list-only processing states into detail UI. */
export function resolveDetailSummaryVisualState(
	input: DetailSummaryVisualStateInput,
): DetailSummaryVisualState {
	const { summaryReady, phase, status, cardStatus, isSubmitting = false, extra } = input
	const canGenerate = canGenerateSummaryFromDetail({ phase, status, isSubmitting, extra })
	const buttonVariant = canGenerate ? getSummaryButtonVariant(phase, status) : null

	if (summaryReady || cardStatus === "summarized") {
		return { status: "ready", canGenerate: false, buttonVariant: null }
	}

	if (
		cardStatus === "waiting" ||
		cardStatus === "processing" ||
		cardStatus === "merge_failed" ||
		phase === "waiting" ||
		(phase === "merging" && status !== "completed")
	) {
		return { status: "unavailable", canGenerate: false, buttonVariant: null }
	}

	if (cardStatus === "summary_failed" || (phase === "summarizing" && status === "failed")) {
		return { status: "failed", canGenerate, buttonVariant }
	}

	if (
		cardStatus === "summarizing" ||
		(phase === "summarizing" && status !== "completed" && status !== "failed")
	) {
		return { status: "generating", canGenerate: false, buttonVariant: null }
	}

	return { status: "pending", canGenerate, buttonVariant }
}

/** Picks model_id from list item extra first, else API-resolved auto model */
export function resolveSummaryModelId(
	itemModelId: string | undefined,
	autoModelId: string | undefined,
): string | undefined {
	if (itemModelId) return itemModelId
	return autoModelId
}

/** Whether a list item should be registered for background progress polling */
export function shouldPollSummaryProgress(
	phase: string | null,
	status: string | null,
	taskKey: string | undefined,
): boolean {
	if (!taskKey) return false
	// Only skip polling when the phase is already in a known terminal state.
	// We intentionally do NOT require status === "in_progress" because the list
	// API may return current_phase without a phase_status (null/missing), yet the
	// backend is still actively processing. resolveCardStatus uses the same
	// "phase present + not finished" heuristic, so polling must match that breadth.
	const isTerminal = status === "completed" || status === "failed"
	if (isTerminal) return false
	// Poll while merging so the UI learns when merging completes and the
	// "Generate Summary" button should appear (merging → audio_processed state).
	if (phase === "merging") return true
	// Poll while summarizing to track AI generation progress in real time.
	if (phase === "summarizing") return true
	return false
}
