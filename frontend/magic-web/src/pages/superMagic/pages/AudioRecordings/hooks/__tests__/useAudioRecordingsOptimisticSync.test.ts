import { describe, expect, it } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { mergeAudioRecordingItems } from "../useAudioRecordingsOptimisticSync"

/** Builds deterministic recording rows without using real task, project, or person data. */
function makeListItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "mock-project-optimistic-merge",
		project_name: "Mock optimistic merge entry",
		created_at: 1780657155,
		duration: 120,
		tags: [],
		device_id: "mock-device-optimistic",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		card_status: "summarized",
		is_summarized: true,
		task_key: "mock-task-optimistic-merge",
		topic_id: "mock-topic-optimistic-merge",
		model_id: "mock-model-optimistic-merge",
		...overrides,
	}
}

describe("mergeAudioRecordingItems", () => {
	it("preserves local summarizing when authoritative row still shows summarized", () => {
		const merged = mergeAudioRecordingItems(
			makeListItem({ card_status: "summarized", is_summarized: true }),
			makeListItem({
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				is_summarized: false,
			}),
		)

		expect(merged.card_status).toBe("summarizing")
		expect(merged.phase_status).toBe("in_progress")
		expect(merged.is_summarized).toBe(false)
	})

	it("preserves local summarizing when authoritative row still shows summary_failed", () => {
		const merged = mergeAudioRecordingItems(
			makeListItem({
				current_phase: "summarizing",
				phase_status: "failed",
				card_status: "summary_failed",
				is_summarized: false,
			}),
			makeListItem({
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				is_summarized: false,
			}),
		)

		expect(merged.card_status).toBe("summarizing")
		expect(merged.phase_status).toBe("in_progress")
	})

	it("uses authoritative row once it reports summarizing", () => {
		const merged = mergeAudioRecordingItems(
			makeListItem({
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				phase_percent: 35,
				is_summarized: false,
			}),
			makeListItem({
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
				phase_percent: 5,
				is_summarized: false,
			}),
		)

		expect(merged.phase_percent).toBe(35)
	})
})
