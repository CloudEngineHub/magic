import { beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
	createFile: vi.fn(),
	batchSaveFiles: vi.fn(),
	saveUploadFileToProject: vi.fn(),
}))

vi.mock("@/utils/env", () => ({ env: () => "" }))
vi.mock("@/apis/clients/magic", () => ({ default: { get: vi.fn() } }))
vi.mock("@/utils/log", () => ({
	logger: {
		createLogger: () => ({ error: vi.fn(), warn: vi.fn(), log: vi.fn() }),
	},
}))
vi.mock("@/apis", () => ({
	SuperMagicApi: apiMocks,
}))
vi.mock("../../hooks/useFileUpload", () => ({
	UploadSource: { Home: 1 },
}))

import { superMagicUploadTokenService } from "../UploadTokenService"

describe("UploadTokenService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("saves deferred workspace-home images into a hidden project temp directory", async () => {
		apiMocks.createFile.mockResolvedValue({ file_id: "tmp-dir-id" })
		apiMocks.batchSaveFiles.mockResolvedValue([
			{
				file_id: "saved-file-id",
				file_name: "photo.png",
				relative_file_path: ".tmp/photo.png",
				is_hidden: true,
			},
		])

		const result = await superMagicUploadTokenService.saveTempFilesToProject(
			[
				{
					file_id: "upload-file-id",
					file_name: "photo.png",
					file_extension: "png",
					file_path: "temporary/photo.png",
					file_size: 100,
					relative_file_path: ".tmp/photo.png",
					is_hidden: true,
				},
			],
			"created-project-id",
			"topic-id",
		)

		expect(apiMocks.createFile).toHaveBeenCalledWith({
			project_id: "created-project-id",
			file_name: ".tmp",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(apiMocks.batchSaveFiles).toHaveBeenCalledWith({
			project_id: "created-project-id",
			parent_id: "tmp-dir-id",
			files: [
				expect.objectContaining({
					file_key: "temporary/photo.png",
					file_name: "photo.png",
					relative_file_path: ".tmp/photo.png",
					is_hidden: true,
				}),
			],
		})
		expect(apiMocks.saveUploadFileToProject).not.toHaveBeenCalled()
		expect(result[0]).toMatchObject({ file_id: "saved-file-id", is_hidden: true })
	})
})
