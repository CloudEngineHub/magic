import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
	reportFileUploads: vi.fn(),
	batchSaveFiles: vi.fn(),
	getSnowflakeIds: vi.fn(),
	getUploadToken: vi.fn(),
	store: vi.fn(),
	getBlob: vi.fn(),
	delete: vi.fn(),
}))

vi.mock("@dtyq/upload-sdk", () => ({
	Upload: vi.fn().mockImplementation(() => ({ upload: mocks.upload })),
}))
vi.mock("@/apis", () => ({
	FileApi: { reportFileUploads: mocks.reportFileUploads },
	SuperMagicApi: {
		batchSaveFiles: mocks.batchSaveFiles,
		getSnowflakeIds: mocks.getSnowflakeIds,
	},
}))
vi.mock("@/models/user", () => ({
	userStore: { user: { organizationCode: "org-1", authorization: "Bearer token" } },
}))
vi.mock("@/utils/log", () => ({
	logger: { createLogger: () => ({ error: vi.fn() }) },
}))
vi.mock("../HtmlScreenshotStorage", () => ({
	htmlScreenshotStorage: {
		store: mocks.store,
		getBlob: mocks.getBlob,
		delete: mocks.delete,
	},
}))
vi.mock("../HtmlScreenshotTargetStore", () => ({
	forgetHtmlScreenshotByStorageId: vi.fn(),
}))
vi.mock("../UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadToken: mocks.getUploadToken,
		getUploadTokenUrl: "https://magic.test/upload-token",
	},
}))

import { htmlScreenshotUploadService } from "../HtmlScreenshotUploadService"

describe("HtmlScreenshotUploadService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		const file = new File(["png"], "screenshot.png", { type: "image/png" })
		mocks.store.mockResolvedValue({
			storageId: "screenshot-storage-id",
			fileName: file.name,
			fileSize: file.size,
			file,
		})
		mocks.getBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }))
		mocks.getUploadToken.mockResolvedValue({ temporary_credential: { dir: "/root/" } })
		mocks.getSnowflakeIds.mockResolvedValue({ ids: ["snowflake-1"] })
		mocks.reportFileUploads.mockResolvedValue([{ file_id: "reported-id" }])
		mocks.batchSaveFiles.mockResolvedValue([
			{
				file_id: "saved-id",
				file_key: "temporary/screenshot.png",
				file_name: "screenshot.png",
				file_size: 3,
				relative_file_path: "screenshot.png",
			},
		])
		mocks.upload.mockImplementation(() => ({
			success: (callback: (response: { data: { path: string } }) => void) =>
				queueMicrotask(() => callback({ data: { path: "temporary/screenshot.png" } })),
			fail: vi.fn(),
			progress: vi.fn(),
		}))
	})

	it("stores a screenshot in IndexedDB without touching project APIs", async () => {
		const result = await htmlScreenshotUploadService.storeScreenshot({
			dataUrl: "data:image/png;base64,AA==",
			fileName: "screenshot.png",
		})

		expect(mocks.store).toHaveBeenCalledWith("data:image/png;base64,AA==", "screenshot.png")
		expect(result).toMatchObject({
			storageId: "screenshot-storage-id",
			fileName: "screenshot.png",
			fileSize: 3,
		})
		expect(mocks.batchSaveFiles).not.toHaveBeenCalled()
	})

	it("saves a stored screenshot as a topic attachment without creating a folder", async () => {
		const result = await htmlScreenshotUploadService.uploadStoredScreenshot({
			storageId: "screenshot-storage-id",
			fileName: "screenshot.png",
			projectId: "project-1",
			topicId: "topic-1",
		})

		expect(mocks.getSnowflakeIds).toHaveBeenCalledWith({ count: 1 })
		expect(mocks.upload).toHaveBeenCalledWith(
			expect.objectContaining({ fileName: "snowflake-1" }),
		)
		expect(mocks.reportFileUploads).toHaveBeenCalledWith([
			expect.objectContaining({
				file_name: "screenshot.png",
				file_key: "temporary/screenshot.png",
			}),
		])
		expect(mocks.batchSaveFiles).toHaveBeenCalledWith({
			project_id: "project-1",
			files: [
				expect.objectContaining({
					topic_id: "topic-1",
					storage_type: "topic",
					file_name: "screenshot.png",
					relative_file_path: "screenshot.png",
					is_hidden: true,
				}),
			],
		})
		expect(mocks.delete).toHaveBeenCalledWith("screenshot-storage-id")
		expect(result).toMatchObject({ file_id: "saved-id", is_hidden: true })
	})

	it("does not upload when snowflake id generation fails", async () => {
		mocks.getSnowflakeIds.mockResolvedValueOnce({ ids: [] })

		await expect(
			htmlScreenshotUploadService.uploadStoredScreenshot({
				storageId: "screenshot-storage-id",
				fileName: "screenshot.png",
				projectId: "project-1",
				topicId: "topic-1",
			}),
		).rejects.toThrow("截图上传未获取到文件ID")

		expect(mocks.upload).not.toHaveBeenCalled()
		expect(mocks.batchSaveFiles).not.toHaveBeenCalled()
	})

	it("keeps a successful upload when local cleanup fails", async () => {
		mocks.delete.mockRejectedValueOnce(new Error("IndexedDB unavailable"))

		await expect(
			htmlScreenshotUploadService.uploadStoredScreenshot({
				storageId: "screenshot-storage-id",
				fileName: "screenshot.png",
				projectId: "project-1",
				topicId: "topic-1",
			}),
		).resolves.toMatchObject({ file_id: "saved-id", is_hidden: true })
	})
})
