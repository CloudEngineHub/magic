import { describe, expect, it, vi } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { SuperMagicApi } from "@/apis"
import { getOrCreateImagesDirFileId } from "../calculateUploadDirectory"

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
