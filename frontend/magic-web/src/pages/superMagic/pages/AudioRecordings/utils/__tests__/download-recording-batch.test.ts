import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import type { RecordingDetailFileMap } from "../../types/recording-detail"

const getTemporaryDownloadUrlMock = vi.fn()
const downloadFileWithAnchorMock = vi.fn()
const createBatchDownloadMock = vi.fn()
const checkBatchDownloadStatusMock = vi.fn()

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: (...args: unknown[]) => getTemporaryDownloadUrlMock(...args),
}))

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	downloadFileWithAnchor: (...args: unknown[]) => downloadFileWithAnchorMock(...args),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createBatchDownload: (...args: unknown[]) => createBatchDownloadMock(...args),
		checkBatchDownloadStatus: (...args: unknown[]) => checkBatchDownloadStatusMock(...args),
	},
}))

vi.mock("sonner", () => ({
	toast: {
		loading: vi.fn(() => "toast-id"),
		dismiss: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("i18next", () => ({
	default: {
		t: (key: string) => key,
	},
}))

const mockFileMap: RecordingDetailFileMap = {
	audio: { file_id: "audio-alpha", file_name: "session.wav" },
	transcript: { file_id: "transcript-alpha", file_name: "session-transcript.md" },
	notes: { file_id: "notes-alpha", file_name: "session-notes.md" },
	summaryFiles: [
		{
			type: "summary",
			fileName: "summary.md",
			file: { file_id: "summary-alpha", file_name: "summary.md" },
		},
	],
}

describe("download-recording-batch", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		getTemporaryDownloadUrlMock.mockReset()
		downloadFileWithAnchorMock.mockReset()
		createBatchDownloadMock.mockReset()
		checkBatchDownloadStatusMock.mockReset()
		getTemporaryDownloadUrlMock.mockResolvedValue([
			{ file_id: "file-alpha", url: "https://example.invalid/export/file.md" },
		])
		createBatchDownloadMock.mockResolvedValue({
			status: "ready",
			download_url: "https://example.invalid/export/batch.zip",
		})
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("collects every exportable file id without duplicates", async () => {
		const { collectExportableFileIds } = await import("../download-recording-batch")
		expect(collectExportableFileIds(mockFileMap)).toEqual([
			"audio-alpha",
			"transcript-alpha",
			"notes-alpha",
			"summary-alpha",
		])
	})

	it("downloads a single file directly", async () => {
		const { downloadRecordingFilesBatch } = await import("../download-recording-batch")
		const result = await downloadRecordingFilesBatch({
			fileIds: ["transcript-alpha"],
			projectId: "project-alpha",
			fileNameById: { "transcript-alpha": "session-transcript.md" },
		})

		expect(result).toBe(true)
		expect(getTemporaryDownloadUrlMock).toHaveBeenCalledWith({ file_ids: ["transcript-alpha"] })
		expect(createBatchDownloadMock).not.toHaveBeenCalled()
	})

	it("creates a batch download when multiple files are requested", async () => {
		const { downloadRecordingFilesBatch } = await import("../download-recording-batch")
		const result = await downloadRecordingFilesBatch({
			fileIds: ["transcript-alpha", "notes-alpha"],
			projectId: "project-alpha",
		})

		expect(result).toBe(true)
		expect(createBatchDownloadMock).toHaveBeenCalledWith({
			file_ids: ["transcript-alpha", "notes-alpha"],
			project_id: "project-alpha",
		})
		expect(downloadFileWithAnchorMock).toHaveBeenCalledWith(
			"https://example.invalid/export/batch.zip",
		)
	})

	it("stops polling and returns false when the batch task fails", async () => {
		createBatchDownloadMock.mockResolvedValue({
			status: "processing",
			batch_key: "batch-alpha",
		})
		checkBatchDownloadStatusMock.mockResolvedValue({
			status: "failed",
			message: "mock failed",
		})

		const { downloadRecordingFilesBatch } = await import("../download-recording-batch")
		const resultPromise = downloadRecordingFilesBatch({
			fileIds: ["transcript-alpha", "notes-alpha"],
			projectId: "project-alpha",
		})

		await vi.advanceTimersByTimeAsync(2000)

		await expect(resultPromise).resolves.toBe(false)
		expect(downloadFileWithAnchorMock).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalled()
	})

	it("stops polling and returns false after the max polling attempts", async () => {
		createBatchDownloadMock.mockResolvedValue({
			status: "processing",
			batch_key: "batch-alpha",
		})
		checkBatchDownloadStatusMock.mockResolvedValue({
			status: "processing",
		})

		const { downloadRecordingFilesBatch } = await import("../download-recording-batch")
		const resultPromise = downloadRecordingFilesBatch({
			fileIds: ["transcript-alpha", "notes-alpha"],
			projectId: "project-alpha",
		})

		await vi.advanceTimersByTimeAsync(60 * 2000)

		await expect(resultPromise).resolves.toBe(false)
		expect(downloadFileWithAnchorMock).not.toHaveBeenCalled()
		expect(toast.error).toHaveBeenCalled()
	})
})
