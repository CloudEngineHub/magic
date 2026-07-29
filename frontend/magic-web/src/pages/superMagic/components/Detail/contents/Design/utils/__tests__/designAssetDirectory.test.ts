import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { SuperMagicApi } from "@/apis"
import { UploadSubDir } from "@/components/CanvasDesign/public/magic-types"
import { getOrCreateImagesDirFileId, getOrCreateUploadSubDirFileId } from "../designAssetDirectory"

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createFile: vi.fn(),
	},
}))

function fileItem(partial: Partial<FileItem> & Pick<FileItem, "file_id">): FileItem {
	return {
		file_name: "",
		name: "",
		relative_file_path: "",
		is_directory: false,
		...partial,
	} as FileItem
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("getOrCreateImagesDirFileId", () => {
	it("recreates images directory when the attachment tree still contains a deleted directory id", async () => {
		vi.mocked(SuperMagicApi.createFile).mockResolvedValueOnce({
			file_id: "images-new",
		} as never)
		const validateImagesDirFileId = vi.fn().mockResolvedValueOnce(false)
		const updateAttachments = vi.fn()

		const result = await getOrCreateImagesDirFileId({
			projectId: "project-1",
			currentFile: { id: "design-dir", name: "新建画布" },
			flatAttachments: [
				fileItem({
					file_id: "design-dir",
					file_name: "新建画布",
					name: "新建画布",
					relative_file_path: "新建画布",
					is_directory: true,
				}),
				fileItem({
					file_id: "images-old",
					file_name: "images",
					name: "images",
					relative_file_path: "新建画布/images",
					is_directory: true,
				}),
			],
			updateAttachments,
			validateImagesDirFileId,
		})

		expect(validateImagesDirFileId).toHaveBeenCalledWith("images-old")
		expect(SuperMagicApi.createFile).toHaveBeenCalledWith({
			project_id: "project-1",
			parent_id: "design-dir",
			file_name: "images",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(updateAttachments).toHaveBeenCalled()
		expect(result).toEqual({
			imagesDirFileId: "images-new",
			suffixDir: "新建画布/images",
		})
	})
})

describe("getOrCreateUploadSubDirFileId", () => {
	it("recreates videos directory when the attachment tree still contains a deleted directory id", async () => {
		vi.mocked(SuperMagicApi.createFile).mockResolvedValueOnce({
			file_id: "videos-new",
		} as never)
		const validateDirFileId = vi.fn().mockResolvedValueOnce(false)
		const updateAttachments = vi.fn()

		const result = await getOrCreateUploadSubDirFileId({
			projectId: "project-1",
			subDir: UploadSubDir.Videos,
			currentFile: { id: "design-dir", name: "新建画布" },
			flatAttachments: [
				fileItem({
					file_id: "design-dir",
					file_name: "新建画布",
					name: "新建画布",
					relative_file_path: "新建画布",
					is_directory: true,
				}),
				fileItem({
					file_id: "videos-old",
					file_name: "videos",
					name: "videos",
					relative_file_path: "新建画布/videos",
					is_directory: true,
				}),
			],
			updateAttachments,
			validateDirFileId,
		})

		expect(validateDirFileId).toHaveBeenCalledWith("videos-old")
		expect(SuperMagicApi.createFile).toHaveBeenCalledWith({
			project_id: "project-1",
			parent_id: "design-dir",
			file_name: "videos",
			is_directory: true,
			ignore_duplicate: true,
		})
		expect(updateAttachments).toHaveBeenCalled()
		expect(result).toEqual({
			assetDirFileId: "videos-new",
			suffixDir: "新建画布/videos",
			subDir: UploadSubDir.Videos,
		})
	})

	it("reuses an existing audios directory when its file id is still valid", async () => {
		const validateDirFileId = vi.fn().mockResolvedValueOnce(true)
		const updateAttachments = vi.fn()

		const result = await getOrCreateUploadSubDirFileId({
			projectId: "project-1",
			subDir: UploadSubDir.Audios,
			currentFile: { id: "design-dir", name: "新建画布" },
			flatAttachments: [
				fileItem({
					file_id: "design-dir",
					file_name: "新建画布",
					name: "新建画布",
					relative_file_path: "新建画布",
					is_directory: true,
				}),
				fileItem({
					file_id: "audios-existing",
					file_name: "audios",
					name: "audios",
					relative_file_path: "新建画布/audios",
					is_directory: true,
				}),
			],
			updateAttachments,
			validateDirFileId,
		})

		expect(validateDirFileId).toHaveBeenCalledWith("audios-existing")
		expect(SuperMagicApi.createFile).not.toHaveBeenCalled()
		expect(updateAttachments).not.toHaveBeenCalled()
		expect(result).toEqual({
			assetDirFileId: "audios-existing",
			suffixDir: "新建画布/audios",
			subDir: UploadSubDir.Audios,
		})
	})
})
