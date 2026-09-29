import { describe, expect, it, vi } from "vitest"
import { persistFileSave } from "../persistFileSave"
import { FileSaveConflictError, FileSavePermanentError } from "../types"

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getFileInfo: vi.fn(),
		replaceFile: vi.fn(),
		saveFileContent: vi.fn(),
	},
}))

vi.mock("@/stores/folderUpload/uploadService", () => ({
	ossUploadService: {
		uploadContentByFileKey: vi.fn(),
	},
}))

vi.mock("@/utils/shadow", () => ({
	unshadow: (value: string) => value.replace(/^SHADOWED_/, ""),
}))

import { SuperMagicApi } from "@/apis"
import { ossUploadService } from "@/stores/folderUpload/uploadService"

describe("persistFileSave", () => {
	it("rejects when the remote version moved past the baseline", async () => {
		vi.mocked(SuperMagicApi.getFileInfo).mockResolvedValue({ version: 4 } as never)
		await expect(
			persistFileSave(
				{
					fileId: "file-1",
					content: "<p>Local</p>",
					enableShadow: false,
					baselineVersion: "3",
				},
				{
					getFileMeta: () => ({ fileKey: "k", projectId: "p" }),
				},
			),
		).rejects.toBeInstanceOf(FileSaveConflictError)
		expect(ossUploadService.uploadContentByFileKey).not.toHaveBeenCalled()
	})

	it("uploads by file key then replaces the file", async () => {
		vi.mocked(SuperMagicApi.getFileInfo).mockResolvedValue({ version: 3 } as never)
		vi.mocked(ossUploadService.uploadContentByFileKey).mockResolvedValue("new-key")
		vi.mocked(SuperMagicApi.replaceFile).mockResolvedValue({} as never)
		await persistFileSave(
			{
				fileId: "file-1",
				content: "<p>Local</p>",
				enableShadow: false,
				baselineVersion: "3",
			},
			{
				getFileMeta: () => ({
					fileKey: "old-key",
					projectId: "project-1",
					fileName: "slide.html",
				}),
			},
		)
		expect(ossUploadService.uploadContentByFileKey).toHaveBeenCalledWith(
			"<p>Local</p>",
			"old-key",
			"project-1",
			"slide.html",
			undefined,
		)
		expect(SuperMagicApi.replaceFile).toHaveBeenCalledWith({
			id: "file-1",
			file_key: "new-key",
		})
	})

	it("treats empty saveFileContent results as permanent", async () => {
		vi.mocked(SuperMagicApi.getFileInfo).mockResolvedValue({ version: 1 } as never)
		vi.mocked(SuperMagicApi.saveFileContent).mockResolvedValue({ success_files: [] } as never)
		await expect(
			persistFileSave(
				{
					fileId: "file-1",
					content: "<p>Local</p>",
					enableShadow: false,
				},
				{
					getFileMeta: () => ({}),
				},
			),
		).rejects.toBeInstanceOf(FileSavePermanentError)
	})
})
