import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
	createFile: vi.fn(),
	reportFileUploads: vi.fn(),
	batchSaveFiles: vi.fn(),
	getUploadToken: vi.fn(),
	changeDir: vi.fn(),
	base64ToFile: vi.fn(),
}))

vi.mock("@dtyq/upload-sdk", () => ({
	Upload: vi.fn().mockImplementation(() => ({ upload: mocks.upload })),
}))
vi.mock("@/apis", () => ({
	FileApi: { reportFileUploads: mocks.reportFileUploads },
	SuperMagicApi: {
		createFile: mocks.createFile,
		batchSaveFiles: mocks.batchSaveFiles,
	},
}))
vi.mock("@/models/user", () => ({
	userStore: { user: { organizationCode: "org-1", authorization: "Bearer token" } },
}))
vi.mock("@/utils/log", () => ({
	logger: { createLogger: () => ({ error: vi.fn() }) },
}))
vi.mock("../../utils/fileConverter", () => ({ base64ToFile: mocks.base64ToFile }))
vi.mock("../UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadToken: mocks.getUploadToken,
		changeDir: mocks.changeDir,
		getUploadTokenUrl: "https://magic.test/upload-token",
	},
}))

import { htmlScreenshotUploadService } from "../HtmlScreenshotUploadService"

describe("HtmlScreenshotUploadService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
		mocks.base64ToFile.mockResolvedValue(
			new File(["png"], "screenshot.png", { type: "image/png" }),
		)
		mocks.getUploadToken.mockResolvedValue({ temporary_credential: { dir: "/root/" } })
		mocks.changeDir.mockReturnValue({ temporary_credential: { dir: "/root/.tmp/" } })
		mocks.reportFileUploads.mockResolvedValue([{ file_id: "reported-id" }])
		mocks.batchSaveFiles.mockResolvedValue([
			{
				file_id: "saved-id",
				file_key: "temporary/screenshot.png",
				file_name: "screenshot.png",
				file_size: 3,
				relative_file_path: ".tmp/screenshot.png",
			},
		])
		mocks.upload.mockImplementation(() => {
			let onSuccess: ((response: { data: { path: string } }) => void) | undefined
			return {
				success: (callback: typeof onSuccess) => {
					onSuccess = callback
					queueMicrotask(() =>
						onSuccess?.({ data: { path: "temporary/screenshot.png" } }),
					)
				},
				fail: vi.fn(),
				progress: vi.fn(),
			}
		})
	})

	it("uploads and saves a screenshot in the hidden workspace temp directory", async () => {
		const result = await htmlScreenshotUploadService.uploadScreenshot({
			dataUrl: "data:image/png;base64,AA==",
			fileName: "screenshot.png",
			projectId: "project-1",
			topicId: "topic-1",
		})

		expect(mocks.createFile).toHaveBeenCalledWith({
			project_id: "project-1",
			file_name: ".tmp",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(mocks.changeDir).toHaveBeenCalledWith(expect.anything(), ".tmp")
		expect(mocks.reportFileUploads).toHaveBeenCalledWith([
			expect.objectContaining({ file_key: "temporary/screenshot.png" }),
		])
		expect(mocks.batchSaveFiles).toHaveBeenCalledWith({
			project_id: "project-1",
			parent_id: "tmp-dir-id",
			files: [
				expect.objectContaining({
					topic_id: "topic-1",
					relative_file_path: ".tmp/screenshot.png",
					is_hidden: true,
				}),
			],
		})
		expect(result).toMatchObject({ file_id: "saved-id", is_hidden: true })
	})
})
