import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecordingBatchSaveReporter } from "../RecordingBatchSaveReporter"

const { batchSaveFiles } = vi.hoisted(() => ({
	batchSaveFiles: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		batchSaveFiles,
	},
}))

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useFileUpload", () => ({
	UploadSource: { RecordSummary: 4 },
}))

vi.mock("../utils/RecordingLogger", () => {
	const logger = {
		log: vi.fn(),
		report: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		namespace: vi.fn(() => logger),
	}
	return { recordingLogger: logger }
})

describe("RecordingBatchSaveReporter", () => {
	beforeEach(() => {
		batchSaveFiles.mockClear()
	})

	it("uses the sandbox task ID when saving an uploaded recording file", async () => {
		const reporter = new RecordingBatchSaveReporter()

		await reporter.reportUploadedFileStrict({
			sessionId: "session-test",
			projectId: "project-test",
			topicId: "topic-test",
			taskId: "sandbox-task-test",
			parentId: "directory-test",
			fileKey: "workspace/recording/segment-test",
			fileName: "segment-test.ogg",
			fileSize: 128,
		})

		expect(batchSaveFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				files: [expect.objectContaining({ task_id: "sandbox-task-test" })],
			}),
		)
	})

	it("keeps batch save running when the sandbox task ID is unavailable", async () => {
		const reporter = new RecordingBatchSaveReporter()

		await reporter.reportUploadedFileStrict({
			sessionId: "session-without-task",
			projectId: "project-without-task",
			topicId: "topic-without-task",
			taskId: "",
			fileKey: "workspace/recording/segment-without-task",
			fileName: "segment-without-task.ogg",
			fileSize: 64,
		})

		expect(batchSaveFiles).toHaveBeenCalledWith(
			expect.objectContaining({
				files: [expect.objectContaining({ task_id: "" })],
			}),
		)
	})
})
