import { describe, expect, it } from "vitest"
import type { AudioProjectApiItem } from "@/types/audioProject"
import {
	normalizeAudioProjectList,
	normalizeAudioProjectListItem,
} from "../normalize-audio-project-item"
import { canSubmitSummary } from "../summary-action-utils"

const MOCK_TOPIC_ID = "900000000000000001"
const MOCK_AUDIO_FILE_ID = "900000000000000002"
const MOCK_TOPIC_ID_ALT = "900000000000000003"
const MOCK_AUDIO_FILE_ID_ALT = "900000000000000004"

const SAMPLE_MERGING: AudioProjectApiItem = {
	id: "900000000000000010",
	project_name: "mock-merging-project",
	created_at: 1700000000,
	project_status: "",
	project_mode: "audio",
	extra: {
		source: "app",
		audio_source: "imported",
		device_id: "mock-device-a",
		duration: 379,
		tags: [],
		current_phase: "merging",
		phase_status: "completed",
		phase_percent: 100,
	},
}

const SAMPLE_SUMMARIZED: AudioProjectApiItem = {
	id: "900000000000000011",
	project_name: "mock-summarized-project",
	created_at: 1700000100,
	project_status: "finished",
	current_topic_status: "finished",
	project_mode: "audio",
	extra: {
		source: "app",
		audio_source: "recorded",
		device_id: "mock-device-b",
		duration: 59,
		tags: ["mock-tag-a", "mock-tag-b", "mock-tag-c", "mock-tag-d"],
		current_phase: "summarizing",
		phase_status: "completed",
		phase_percent: 100,
	},
}

describe("normalizeAudioProjectListItem", () => {
	it("maps nested extra fields for merging completed items as not_summarized", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			extra: {
				...SAMPLE_MERGING.extra,
				task_key: "mock-task-key-merging",
				topic_id: MOCK_TOPIC_ID_ALT,
				audio_file_id: MOCK_AUDIO_FILE_ID_ALT,
				model_id: "mock-model-id",
			},
		})

		expect(item).not.toBeNull()
		expect(item?.duration).toBe(379)
		expect(item?.created_at).toBe(1700000000)
		expect(item?.device_id).toBe("mock-device-a")
		expect(item?.audio_source).toBe("imported")
		expect(item?.current_phase).toBe("merging")
		expect(item?.card_status).toBe("not_summarized")
		expect(item?.is_summarized).toBe(false)
		expect(item?.tags).toEqual([])
		expect(item?.task_key).toBe("mock-task-key-merging")
		expect(item?.topic_id).toBe(MOCK_TOPIC_ID_ALT)
		expect(item?.audio_file_id).toBe(MOCK_AUDIO_FILE_ID_ALT)
		expect(item?.model_id).toBe("mock-model-id")
	})

	it("does not treat finished project status as summarized", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			project_status: "finished",
			current_topic_status: "finished",
		})

		expect(item?.card_status).toBe("not_summarized")
		expect(item?.is_summarized).toBe(false)
	})

	it("keeps summarizing failed items visible and resolves card_status as summary_failed", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			project_status: "",
			extra: {
				...SAMPLE_MERGING.extra,
				current_phase: "summarizing",
				phase_status: "failed",
			},
		})

		expect(item?.card_status).toBe("summary_failed")
		expect(item?.is_summarized).toBe(false)
	})

	it("marks finished projects as summarized and keeps tags", () => {
		const item = normalizeAudioProjectListItem(SAMPLE_SUMMARIZED)

		expect(item?.duration).toBe(59)
		expect(item?.card_status).toBe("summarized")
		expect(item?.is_summarized).toBe(true)
		expect(item?.current_phase).toBe("summarizing")
		expect(item?.tags).toHaveLength(4)
	})

	it("maps waiting items into the explicit waiting card status", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			extra: { ...SAMPLE_MERGING.extra, current_phase: "waiting" },
		})

		expect(item).not.toBeNull()
		expect(item?.card_status).toBe("waiting")
		expect(item?.is_summarized).toBe(false)
	})

	it("maps merging in progress items as processing", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			project_status: "",
			extra: {
				...SAMPLE_MERGING.extra,
				phase_status: "in_progress",
				task_key: "mock-task-key-processing",
			},
		})

		expect(item).not.toBeNull()
		expect(item?.card_status).toBe("processing")
		expect(item?.is_summarized).toBe(false)
	})

	it("maps merging failed items as merge_failed", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			project_status: "",
			extra: {
				...SAMPLE_MERGING.extra,
				phase_status: "failed",
				phase_error: "mock merge failure",
			},
		})

		expect(item).not.toBeNull()
		expect(item?.card_status).toBe("merge_failed")
		expect(item?.is_summarized).toBe(false)
	})

	it("marks summarizing phase without finished status but status in_progress as summarizing", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_SUMMARIZED,
			project_status: "",
			current_topic_status: "",
			extra: {
				...SAMPLE_SUMMARIZED.extra,
				phase_status: "in_progress",
			},
		})

		expect(item?.card_status).toBe("summarizing")
		expect(item?.is_summarized).toBe(false)
	})

	it("lets summarizing in progress override stale finished flags", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_SUMMARIZED,
			is_summarized: 1,
			project_status: "finished",
			current_topic_status: "finished",
			extra: {
				...SAMPLE_SUMMARIZED.extra,
				phase_status: "in_progress",
			},
		})

		expect(item?.card_status).toBe("summarizing")
		expect(item?.is_summarized).toBe(false)
	})

	it("maps backend duration_seconds when list duration is not hydrated yet", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_SUMMARIZED,
			project_status: "",
			current_topic_status: "",
			extra: {
				...SAMPLE_SUMMARIZED.extra,
				duration: undefined,
				duration_seconds: 23,
				phase_status: "in_progress",
			} as AudioProjectApiItem["extra"] & { duration_seconds: number },
		})

		expect(item?.duration).toBe(23)
		expect(item?.card_status).toBe("summarizing")
	})

	it("preserves large string snowflake ids from parseJsonLargeIntAsString output", () => {
		const item = normalizeAudioProjectListItem({
			...SAMPLE_MERGING,
			extra: {
				...SAMPLE_MERGING.extra,
				task_key: "mock-task-key-large-id",
				topic_id: MOCK_TOPIC_ID,
				audio_file_id: MOCK_AUDIO_FILE_ID,
				model_id: "mock-model-id-large",
			},
		})

		expect(item?.topic_id).toBe(MOCK_TOPIC_ID)
		expect(item?.audio_file_id).toBe(MOCK_AUDIO_FILE_ID)
		expect(
			canSubmitSummary({
				task_key: item?.task_key,
				topic_id: item?.topic_id,
				audio_source: item?.audio_source,
				audio_file_id: item?.audio_file_id,
			}),
		).toBe(true)
	})

	it("supports legacy flat API fields", () => {
		const item = normalizeAudioProjectListItem({
			id: "legacy-1",
			project_name: "Legacy",
			is_summarized: 1,
			create_timestamp: "1710000000",
			duration: 120,
			device_id: "Device-A",
			tags: ["A"],
			source: 1,
		})

		expect(item?.card_status).toBe("summarized")
		expect(item?.is_summarized).toBe(true)
		expect(item?.duration).toBe(120)
		expect(item?.created_at).toBe(1710000000)
		expect(item?.device_id).toBe("Device-A")
		expect(item?.tags).toEqual(["A"])
	})
})

describe("normalizeAudioProjectList", () => {
	it("keeps waiting and merge-failed items in the batch", () => {
		const list = normalizeAudioProjectList([
			SAMPLE_MERGING,
			{
				...SAMPLE_MERGING,
				id: "visible-waiting",
				extra: { ...SAMPLE_MERGING.extra, current_phase: "waiting" },
			},
			{
				...SAMPLE_MERGING,
				id: "visible-merge-failed",
				extra: { ...SAMPLE_MERGING.extra, phase_status: "failed" },
			},
			SAMPLE_SUMMARIZED,
		])

		expect(list).toHaveLength(4)
		expect(list.map((item) => item.id)).toEqual([
			SAMPLE_MERGING.id,
			"visible-waiting",
			"visible-merge-failed",
			SAMPLE_SUMMARIZED.id,
		])
	})
})
