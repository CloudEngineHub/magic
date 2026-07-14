import { describe, expect, it } from "vitest"
import type { AudioProjectListItem } from "@/types/audioProject"
import { canCopyAudioProject } from "../copy-availability"

function buildItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "mock-audio-project-id",
		project_name: "Mock audio project",
		created_at: 1710000000,
		duration: 120,
		tags: [],
		device_id: "mock-device-id",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		card_status: "summarized",
		is_summarized: true,
		task_key: "mock-task-key",
		topic_id: "mock-topic-id",
		audio_file_id: "mock-audio-file-id",
		model_id: "mock-model-id",
		...overrides,
	}
}

describe("canCopyAudioProject", () => {
	it("allows completed recordings even when summary has not been generated", () => {
		const result = canCopyAudioProject(
			buildItem({
				current_phase: "merging",
				phase_status: "completed",
				card_status: "not_summarized",
				is_summarized: false,
			}),
		)

		expect(result.canCopy).toBe(true)
	})

	it("allows summarized recordings", () => {
		const result = canCopyAudioProject(buildItem())

		expect(result.canCopy).toBe(true)
	})

	it("blocks recordings whose merge is still running", () => {
		const result = canCopyAudioProject(
			buildItem({
				current_phase: "merging",
				phase_status: "in_progress",
				card_status: "processing",
			}),
		)

		expect(result).toEqual({
			canCopy: false,
			reason: "statusUnavailable",
		})
	})

	it("blocks recordings that are currently summarizing", () => {
		const result = canCopyAudioProject(
			buildItem({
				current_phase: "summarizing",
				phase_status: "in_progress",
				card_status: "summarizing",
			}),
		)

		expect(result.canCopy).toBe(false)
		expect(result.reason).toBe("statusUnavailable")
	})

	it("blocks missing source project ids", () => {
		const result = canCopyAudioProject(buildItem({ id: "" }))

		expect(result.canCopy).toBe(false)
		expect(result.reason).toBe("missingProjectId")
	})
})
