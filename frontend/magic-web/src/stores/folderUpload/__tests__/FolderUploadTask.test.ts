import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { FolderUploadTask } from "../FolderUploadTask"
import type { TaskCallbacks, UploadResult } from "../types"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		batchSaveFiles: vi.fn(),
		createFile: vi.fn(),
	},
}))

vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({
			error: vi.fn(),
			log: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		}),
	},
}))

vi.mock("../uploadService", () => ({
	ossUploadService: {
		uploadFiles: vi.fn(),
		cancelTaskUploads: vi.fn(),
		forceCleanupTask: vi.fn(),
		hasActiveUploadsForTask: vi.fn(() => false),
		pauseTaskUploads: vi.fn(),
		resumeTaskUploads: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}))

type FolderUploadTaskInternals = FolderUploadTask & {
	pendingSaveFiles: UploadResult[]
	callbacks: TaskCallbacks
	fileKeyToRelativePath: Map<string, string>
	executePendingSave: () => Promise<void>
	finalizeRemainingFiles: () => Promise<void>
}

function createTask(): FolderUploadTaskInternals {
	const task = new FolderUploadTask(
		[new File(["image"], "image.png", { type: "image/png" })],
		"parent-id",
		{
			projectId: "project-id",
			projectName: "Project",
			t: (key) => key,
		},
	)
	return task as unknown as FolderUploadTaskInternals
}

function seedPendingSave(task: FolderUploadTaskInternals): void {
	task.pendingSaveFiles = [
		{
			file_key: "oss-key",
			file_name: "image.png",
			file_size: 5,
			file_extension: "png",
			relative_file_path: "images/image.png",
		},
	]
	task.fileKeyToRelativePath.set("oss-key", "image.png")
}

describe("FolderUploadTask project save failures", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>
	let consoleLogSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		vi.clearAllMocks()
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
		consoleLogSpy.mockRestore()
	})

	it("rejects callers when realtime project save fails", async () => {
		vi.mocked(SuperMagicApi.batchSaveFiles).mockRejectedValueOnce(new Error("save failed"))
		const task = createTask()
		const onError = vi.fn()
		const onComplete = vi.fn()
		task.callbacks = { onError, onComplete }
		seedPendingSave(task)

		await task.executePendingSave()

		expect(task.state.isError).toBe(true)
		expect(task.state.currentPhase).toBe("error")
		expect(task.state.errorMessage).toBe("save failed")
		expect(onError).toHaveBeenCalledOnce()
		expect(onError).toHaveBeenCalledWith(
			task.id,
			expect.objectContaining({ message: "save failed" }),
		)
		expect(onComplete).not.toHaveBeenCalled()
		expect(task.pendingSaveFiles).toEqual([])
	})

	it("rejects callers when final project save fails", async () => {
		vi.mocked(SuperMagicApi.batchSaveFiles).mockRejectedValueOnce(
			new Error("final save failed"),
		)
		const task = createTask()
		const onError = vi.fn()
		const onComplete = vi.fn()
		task.callbacks = { onError, onComplete }
		seedPendingSave(task)

		await task.finalizeRemainingFiles()

		expect(task.state.isError).toBe(true)
		expect(task.state.currentPhase).toBe("error")
		expect(task.state.errorMessage).toBe("final save failed")
		expect(onError).toHaveBeenCalledOnce()
		expect(onError).toHaveBeenCalledWith(
			task.id,
			expect.objectContaining({ message: "final save failed" }),
		)
		expect(onComplete).not.toHaveBeenCalled()
		expect(task.pendingSaveFiles).toEqual([])
	})
})
