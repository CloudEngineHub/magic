import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { useRecordingDetailActions } from "../useRecordingDetailActions"
import { resubmitAudioRecordingSummary } from "../../utils/audio-recording-actions"
import type { AudioProjectListItem } from "@/types/audioProject"

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("../../utils/audio-recording-actions", () => ({
	buildOptimisticSummarizingProject: (item: AudioProjectListItem) => ({
		...item,
		card_status: "summarizing",
		current_phase: "summarizing",
		phase_status: "in_progress",
	}),
	deleteAudioRecordingProjects: vi.fn(),
	moveAudioRecordingProjects: vi.fn(),
	renameAudioRecordingProject: vi.fn(),
	resubmitAudioRecordingSummary: vi.fn(),
	submitAudioRecordingSummary: vi.fn(),
}))

vi.mock("../../utils/download-recording-audio", () => ({
	downloadRecordingAudioFile: vi.fn(),
}))

vi.mock("../../utils/download-recording-attachment", () => ({
	downloadRecordingAttachmentFile: vi.fn(),
}))

vi.mock("../../utils/download-recording-batch", () => ({
	collectExportableFileIds: vi.fn(() => []),
	downloadRecordingFilesBatch: vi.fn(),
	resolveExportableFileRefs: vi.fn(() => []),
}))

const baseProjectItem: AudioProjectListItem = {
	id: "project-alpha",
	project_name: "Weekly sync",
	created_at: 1710000000,
	duration: 120,
	card_status: "summarized",
	current_phase: "summarizing",
	phase_status: "completed",
	audio_source: "recorded",
	workspace_id: "group-a",
	task_key: "task-alpha",
	topic_id: "topic-alpha",
	model_id: "model-alpha",
}

describe("useRecordingDetailActions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("does not show a global success toast when detail resummary starts", async () => {
		vi.mocked(resubmitAudioRecordingSummary).mockResolvedValue({ ok: true })
		const onProjectItemChange = vi.fn()

		const { result } = renderHook(() =>
			useRecordingDetailActions({
				projectId: "project-alpha",
				projectItem: baseProjectItem,
				fileMap: null,
				recordingName: "Weekly sync",
				onProjectItemChange,
				onRefresh: vi.fn(),
			}),
		)

		let submitted = false
		await act(async () => {
			submitted = await result.current.resubmitSummary()
		})

		expect(submitted).toBe(true)
		expect(onProjectItemChange).toHaveBeenCalledWith(
			expect.objectContaining({
				card_status: "summarizing",
				current_phase: "summarizing",
				phase_status: "in_progress",
			}),
		)
		expect(toast.success).not.toHaveBeenCalled()
	})
})
