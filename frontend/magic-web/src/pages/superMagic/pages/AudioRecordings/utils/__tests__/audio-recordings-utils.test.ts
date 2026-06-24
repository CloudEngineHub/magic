import { describe, expect, it, vi } from "vitest"
import { Bluetooth, Monitor, Smartphone, Upload } from "lucide-react"
import type { AudioProjectListItem } from "@/types/audioProject"

vi.mock("i18next", () => ({
	default: {
		t: (key: string) => key,
		use: vi.fn().mockReturnThis(),
	},
	t: (key: string) => key,
}))

vi.mock("@/services/audioRecordings", () => ({
	ALL_RECORDING_GROUP_ID: "mock-all-group",
}))

vi.mock("@/utils/string", () => ({
	formatTime: () => "mock-time",
}))
import {
	applyClientSummaryFilter,
	buildAudioProjectsQueryParams,
	formatRecordingDuration,
	isAudioProjectDetailReady,
	isAudioProjectPreviewReady,
	isAudioProjectSummarizing,
	isAudioProjectSummaryReady,
	resolveRecordingSourceIcon,
	resolveRecordingSourceLabel,
} from "../audio-recordings-utils"

const MOCK_AUDIO_FILE_ID = "mock-audio-file-001"

function createItem(overrides: Partial<AudioProjectListItem> = {}): AudioProjectListItem {
	return {
		id: "project-1",
		project_name: "Weekly sync",
		card_status: "summarized",
		is_summarized: true,
		created_at: 1710000000,
		duration: 754,
		tags: [],
		device_id: "mock-device",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		...overrides,
	}
}

describe("isAudioProjectPreviewReady", () => {
	it("allows summarized items", () => {
		expect(isAudioProjectPreviewReady(createItem())).toBe(true)
	})

	it("allows not_summarized items with audio_file_id", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "not_summarized",
					is_summarized: false,
					audio_file_id: MOCK_AUDIO_FILE_ID,
				}),
			),
		).toBe(true)
	})

	it("blocks not_summarized items without audio_file_id", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "not_summarized",
					is_summarized: false,
				}),
			),
		).toBe(false)
	})

	it("allows summarizing items without audio_file_id for detail placeholder navigation", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "summarizing",
					is_summarized: false,
				}),
			),
		).toBe(true)
	})

	it("allows summarizing items with audio_file_id for raw audio preview", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "summarizing",
					is_summarized: false,
					audio_file_id: MOCK_AUDIO_FILE_ID,
				}),
			),
		).toBe(true)
	})

	it("blocks processing items before source content is ready", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "processing",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "in_progress",
				}),
			),
		).toBe(false)
	})

	it("blocks waiting items before the backend starts merge work", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "waiting",
					is_summarized: false,
					current_phase: "waiting",
					phase_status: null,
				}),
			),
		).toBe(false)
	})

	it("blocks merge_failed items before a retry flow exists", () => {
		expect(
			isAudioProjectPreviewReady(
				createItem({
					card_status: "merge_failed",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "failed",
				}),
			),
		).toBe(false)
	})
})

describe("isAudioProjectDetailReady", () => {
	it("only allows summarized items", () => {
		expect(isAudioProjectDetailReady(createItem())).toBe(true)
		expect(
			isAudioProjectDetailReady(
				createItem({
					card_status: "not_summarized",
					audio_file_id: MOCK_AUDIO_FILE_ID,
				}),
			),
		).toBe(false)
	})
})

describe("isAudioProjectSummaryReady", () => {
	it("treats summarized card_status as ready", () => {
		expect(
			isAudioProjectSummaryReady(
				createItem({
					card_status: "summarized",
					current_phase: "summarizing",
					phase_status: "completed",
				}),
			),
		).toBe(true)
	})

	it("treats summarizing phase with completed status as ready", () => {
		expect(
			isAudioProjectSummaryReady(
				createItem({
					card_status: "summarizing",
					current_phase: "summarizing",
					phase_status: "completed",
				}),
			),
		).toBe(true)
	})

	it("does not treat not_summarized items as ready", () => {
		expect(
			isAudioProjectSummaryReady(
				createItem({
					card_status: "not_summarized",
					current_phase: "merging",
					phase_status: "completed",
				}),
			),
		).toBe(false)
	})
})

describe("isAudioProjectSummarizing", () => {
	it("treats not_summarized items as not summarizing", () => {
		expect(
			isAudioProjectSummarizing(
				createItem({
					card_status: "not_summarized",
					current_phase: "merging",
					phase_status: "completed",
				}),
			),
		).toBe(false)
	})

	it("treats summarizing card_status as summarizing", () => {
		expect(
			isAudioProjectSummarizing(
				createItem({
					card_status: "summarizing",
					current_phase: "summarizing",
					phase_status: "in_progress",
				}),
			),
		).toBe(true)
	})

	it("treats summarizing phase with in_progress status as summarizing", () => {
		expect(
			isAudioProjectSummarizing(
				createItem({
					card_status: "summarizing",
					current_phase: "summarizing",
					phase_status: "in_progress",
				}),
			),
		).toBe(true)
	})

	it("treats summarizing phase with null status as summarizing", () => {
		expect(
			isAudioProjectSummarizing(
				createItem({
					card_status: "summarizing",
					current_phase: "summarizing",
					phase_status: null,
				}),
			),
		).toBe(true)
	})

	it("does not treat completed summarizing phase as summarizing", () => {
		expect(
			isAudioProjectSummarizing(
				createItem({
					card_status: "summarized",
					current_phase: "summarizing",
					phase_status: "completed",
				}),
			),
		).toBe(false)
	})
})

describe("applyClientSummaryFilter", () => {
	it("keeps waiting, processing, and merge_failed items in the not_summarized tab", () => {
		const filtered = applyClientSummaryFilter(
			[
				createItem({
					id: "waiting",
					card_status: "waiting",
					is_summarized: false,
					current_phase: "waiting",
					phase_status: null,
				}),
				createItem({
					id: "processing",
					card_status: "processing",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "in_progress",
				}),
				createItem({
					id: "not-summarized",
					card_status: "not_summarized",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "completed",
				}),
				createItem({
					id: "merge-failed",
					card_status: "merge_failed",
					is_summarized: false,
					current_phase: "merging",
					phase_status: "failed",
				}),
				createItem({
					id: "summarized",
					card_status: "summarized",
					is_summarized: true,
				}),
			],
			"not_summarized",
		)

		expect(filtered.map((item) => item.id)).toEqual([
			"waiting",
			"processing",
			"not-summarized",
			"merge-failed",
		])
	})
})

describe("formatRecordingDuration", () => {
	it("formats sub-hour duration as mm:ss", () => {
		expect(formatRecordingDuration(0)).toBe("00:00")
		expect(formatRecordingDuration(1)).toBe("00:01")
		expect(formatRecordingDuration(65)).toBe("01:05")
		expect(formatRecordingDuration(3599)).toBe("59:59")
	})

	it("keeps hour segment for one hour and above", () => {
		expect(formatRecordingDuration(3600)).toBe("01:00:00")
		expect(formatRecordingDuration(3661)).toBe("01:01:01")
	})
})

const SOURCE_LABELS = {
	sourceRecorded: "Phone mic",
	sourceImported: "Imported audio",
	sourceDevice: "Device recording",
	sourcePc: "PC",
}

describe("resolveRecordingSourceLabel", () => {
	it("returns imported label for imported audio regardless of source", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ audio_source: "imported", source: "app" }),
				SOURCE_LABELS,
			),
		).toBe("Imported audio")
	})

	it("returns device name for app source when device_id present", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ source: "app", device_id: "Redmi K70" }),
				SOURCE_LABELS,
			),
		).toBe("Redmi K70")
	})

	it("returns fallback label for app source when no device_id", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ source: "app", device_id: "" }),
				SOURCE_LABELS,
			),
		).toBe("Phone mic")
	})

	it("returns device name for device source when device_id present", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ source: "device", device_id: "MagicCard-001" }),
				SOURCE_LABELS,
			),
		).toBe("MagicCard-001")
	})

	it("returns fixed PC label for pc source ignoring device_id", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ source: "pc", device_id: "Web" }),
				SOURCE_LABELS,
			),
		).toBe("PC")
	})

	it("returns fixed phone label for h5 source ignoring device_id", () => {
		expect(
			resolveRecordingSourceLabel(
				createItem({ source: "h5", device_id: "Web" }),
				SOURCE_LABELS,
			),
		).toBe("Phone mic")
	})

	it("returns fixed phone label for legacy null source", () => {
		expect(
			resolveRecordingSourceLabel(createItem({ source: null, device_id: "" }), SOURCE_LABELS),
		).toBe("Phone mic")
	})
})

describe("resolveRecordingSourceIcon", () => {
	it("returns Upload for imported audio", () => {
		expect(resolveRecordingSourceIcon(createItem({ audio_source: "imported" }))).toBe(Upload)
	})

	it("returns Bluetooth for device source", () => {
		expect(resolveRecordingSourceIcon(createItem({ source: "device" }))).toBe(Bluetooth)
	})

	it("returns Monitor for pc source", () => {
		expect(resolveRecordingSourceIcon(createItem({ source: "pc" }))).toBe(Monitor)
	})

	it("returns Smartphone for app source", () => {
		expect(resolveRecordingSourceIcon(createItem({ source: "app" }))).toBe(Smartphone)
	})

	it("returns Smartphone for h5 source", () => {
		expect(resolveRecordingSourceIcon(createItem({ source: "h5" }))).toBe(Smartphone)
	})

	it("returns Smartphone fallback for legacy null source", () => {
		expect(resolveRecordingSourceIcon(createItem({ source: null }))).toBe(Smartphone)
	})
})

describe("buildAudioProjectsQueryParams", () => {
	const defaultOptions = {
		page: 1,
		pageSize: 20,
		keyword: "",
		summaryFilter: "all" as const,
		sortBy: "created_at" as const,
		sortOrder: "desc" as const,
	}

	it("omits workspace_id parameter when options workspaceId matches ALL_RECORDING_GROUP_ID", () => {
		const params = buildAudioProjectsQueryParams({
			...defaultOptions,
			workspaceId: "mock-all-group", // matches mocked ALL_RECORDING_GROUP_ID
		})
		expect(params.workspace_id).toBeUndefined()
	})

	it("omits workspace_id parameter when options workspaceId is not provided", () => {
		const params = buildAudioProjectsQueryParams(defaultOptions)
		expect(params.workspace_id).toBeUndefined()
	})

	it("includes empty workspace_id parameter when options workspaceId is empty (ungrouped)", () => {
		const params = buildAudioProjectsQueryParams({
			...defaultOptions,
			workspaceId: "",
		})
		expect(params.workspace_id).toBe("")
	})

	it("includes workspace_id parameter when options workspaceId is a custom group id", () => {
		const params = buildAudioProjectsQueryParams({
			...defaultOptions,
			workspaceId: "group-custom-123",
		})
		expect(params.workspace_id).toBe("group-custom-123")
	})
})
