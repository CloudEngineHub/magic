import { describe, expect, it } from "vitest"
import {
	canClickSummaryButton,
	canGenerateSummaryFromDetail,
	canSubmitSummary,
	getSummaryButtonVariant,
	resolveDetailSummaryVisualState,
	resolveSummaryModelId,
	shouldPollSummaryProgress,
	shouldShowSummaryButton,
} from "../summary-action-utils"

describe("summary-action-utils", () => {
	it("shows generate button for merging completed", () => {
		expect(shouldShowSummaryButton("merging", "completed")).toBe(true)
		expect(getSummaryButtonVariant("merging", "completed")).toBe("generate")
		expect(canClickSummaryButton("merging", "completed", false)).toBe(true)
	})

	it("hides retry button for summarizing failed until backend retry API is ready", () => {
		expect(shouldShowSummaryButton("summarizing", "failed")).toBe(false)
		expect(getSummaryButtonVariant("summarizing", "failed")).toBeNull()
		expect(canClickSummaryButton("summarizing", "failed", false)).toBe(false)
	})

	it("hides button while summarizing in progress", () => {
		expect(shouldShowSummaryButton("summarizing", "in_progress")).toBe(false)
		expect(canClickSummaryButton("summarizing", "in_progress", false)).toBe(false)
	})

	it("keeps manual-summary button hidden until merging is completed", () => {
		expect(shouldShowSummaryButton("merging", "in_progress")).toBe(false)
		expect(canClickSummaryButton("merging", "in_progress", false)).toBe(false)
	})

	it("disables button while submitting", () => {
		expect(canClickSummaryButton("merging", "completed", true)).toBe(false)
	})

	it("validates submit params per audio source", () => {
		expect(
			canSubmitSummary({
				task_key: "session-Android-1",
				topic_id: "topic-1",
				audio_source: "recorded",
			}),
		).toBe(true)

		expect(
			canSubmitSummary({
				task_key: "session-Android-1",
				topic_id: "topic-1",
				audio_source: "imported",
				audio_file_id: "file-1",
			}),
		).toBe(true)

		expect(
			canSubmitSummary({
				task_key: "session-Android-1",
				topic_id: "topic-1",
				audio_source: "imported",
			}),
		).toBe(false)
	})

	it("aligns detail summary CTA with card button visibility and submit requirements", () => {
		expect(
			canGenerateSummaryFromDetail({
				phase: "merging",
				status: "completed",
				isSubmitting: false,
				extra: {
					task_key: "session-web-mock-1",
					topic_id: "topic-web-mock-1",
					audio_source: "recorded",
				},
			}),
		).toBe(true)

		expect(
			canGenerateSummaryFromDetail({
				phase: "summarizing",
				status: "in_progress",
				isSubmitting: false,
				extra: {
					task_key: "session-web-mock-1",
					topic_id: "topic-web-mock-1",
					audio_source: "recorded",
				},
			}),
		).toBe(false)

		expect(
			canGenerateSummaryFromDetail({
				phase: "summarizing",
				status: "failed",
				isSubmitting: false,
				extra: {
					task_key: "session-web-mock-1",
					topic_id: "topic-web-mock-1",
					audio_source: "recorded",
				},
			}),
		).toBe(false)

		expect(
			canGenerateSummaryFromDetail({
				phase: "merging",
				status: "completed",
				isSubmitting: false,
				extra: {
					task_key: "session-web-mock-1",
					topic_id: "topic-web-mock-1",
					audio_source: "imported",
				},
			}),
		).toBe(false)
	})

	it("resolves model_id from item extra before API auto model", () => {
		expect(resolveSummaryModelId("item-model", "auto-model-from-api")).toBe("item-model")
		expect(resolveSummaryModelId(undefined, "auto-model-from-api")).toBe("auto-model-from-api")
		expect(resolveSummaryModelId(undefined, undefined)).toBeUndefined()
	})

	it("resolves detail summary visual states without promoting non-preview list states", () => {
		const baseExtra = {
			task_key: "task-detail-001",
			topic_id: "topic-detail-001",
			audio_source: "recorded" as const,
		}

		expect(
			resolveDetailSummaryVisualState({
				summaryReady: true,
				phase: "summarizing",
				status: "completed",
				cardStatus: "summarized",
				extra: baseExtra,
			}),
		).toMatchObject({ status: "ready", canGenerate: false })

		expect(
			resolveDetailSummaryVisualState({
				summaryReady: false,
				phase: "merging",
				status: "completed",
				cardStatus: "not_summarized",
				extra: baseExtra,
			}),
		).toMatchObject({ status: "pending", canGenerate: true, buttonVariant: "generate" })

		expect(
			resolveDetailSummaryVisualState({
				summaryReady: false,
				phase: "summarizing",
				status: "in_progress",
				cardStatus: "summarizing",
				extra: baseExtra,
			}),
		).toMatchObject({ status: "generating", canGenerate: false })

		expect(
			resolveDetailSummaryVisualState({
				summaryReady: false,
				phase: "summarizing",
				status: "failed",
				cardStatus: "summary_failed",
				extra: baseExtra,
			}),
		).toMatchObject({ status: "failed", canGenerate: false, buttonVariant: null })

		expect(
			resolveDetailSummaryVisualState({
				summaryReady: false,
				phase: "waiting",
				status: "in_progress",
				cardStatus: "waiting",
				extra: baseExtra,
			}),
		).toMatchObject({ status: "unavailable", canGenerate: false })
	})

	it("registers polling for active phases, skips terminal states", () => {
		// Explicit in_progress
		expect(shouldPollSummaryProgress("summarizing", "in_progress", "task-1")).toBe(true)
		expect(shouldPollSummaryProgress("merging", "in_progress", "task-1")).toBe(true)
		// phase_status null/missing — backend may omit it; card_status still shows "summarizing"
		// so polling must trigger to eventually update the UI
		expect(shouldPollSummaryProgress("summarizing", null, "task-1")).toBe(true)
		expect(shouldPollSummaryProgress("merging", null, "task-1")).toBe(true)
		// Terminal states must NOT poll
		expect(shouldPollSummaryProgress("summarizing", "completed", "task-1")).toBe(false)
		expect(shouldPollSummaryProgress("summarizing", "failed", "task-1")).toBe(false)
		expect(shouldPollSummaryProgress("merging", "completed", "task-1")).toBe(false)
		// Missing task_key always returns false
		expect(shouldPollSummaryProgress("summarizing", "in_progress", undefined)).toBe(false)
	})
})
