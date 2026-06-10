import { describe, expect, it } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { buildImagesDirCacheKey } from "../imagesDirCacheKey"

function createDesignDirectory(children: FileItem[] = []): FileItem[] {
	return [
		{
			file_id: "design-dir",
			file_name: "新建画布",
			name: "新建画布",
			relative_file_path: "新建画布",
			is_directory: true,
		} as FileItem,
		...children,
	]
}

describe("buildImagesDirCacheKey", () => {
	it("changes when the images directory is removed from attachments", () => {
		const currentFile = { id: "design-dir", name: "新建画布" }
		const existingImagesKey = buildImagesDirCacheKey({
			projectId: "project-1",
			currentFile,
			flatAttachments: createDesignDirectory([
				{
					file_id: "images-old",
					file_name: "images",
					name: "images",
					relative_file_path: "新建画布/images",
					is_directory: true,
				} as FileItem,
			]),
		})

		const removedImagesKey = buildImagesDirCacheKey({
			projectId: "project-1",
			currentFile,
			flatAttachments: createDesignDirectory(),
		})

		expect(existingImagesKey).toBe("project-1:design-dir:新建画布:新建画布/images:images-old")
		expect(removedImagesKey).toBe("project-1:design-dir:新建画布:新建画布/images:")
		expect(removedImagesKey).not.toBe(existingImagesKey)
	})
})
