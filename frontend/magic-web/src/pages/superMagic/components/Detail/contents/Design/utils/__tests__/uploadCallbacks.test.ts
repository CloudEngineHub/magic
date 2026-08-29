import { describe, expect, it, vi } from "vitest"
import { UploadSubDir, type UploadFile } from "@/components/CanvasDesign/public/magic-types"
import type { BatchSaveInfo } from "@/stores/folderUpload/types"
import { processBatchSavedFiles } from "../uploadCallbacks"

function createBatchSaveInfo(relativeFilePath?: string): BatchSaveInfo {
	return {
		taskId: "task-1",
		savedFilesCount: 1,
		totalProcessedFiles: 1,
		savedFiles: [
			{
				file_key: "storage-key",
				file_id: "file-1",
				file_name: "x.png",
				file_size: 1024,
				relative_file_path: relativeFilePath,
			},
		],
	}
}

async function processPath(options: {
	relativeFilePath?: string
	suffixDir: string
	designProjectBasePath?: string
}) {
	const setFileInfoCache = vi.fn()
	const result = await processBatchSavedFiles({
		batchSaveInfo: createBatchSaveInfo(options.relativeFilePath),
		suffixDir: options.suffixDir,
		uploadSubDir: UploadSubDir.Images,
		designProjectBasePath: options.designProjectBasePath,
		fileNameToUploadFileMap: new Map<string, UploadFile>(),
		processedFileNames: new Set<string>(),
		pendingGetFileInfoRef: { current: new Map() },
		getFileInfoById: vi.fn().mockResolvedValue({
			src: "https://example.test/x.png",
			fileName: "x.png",
			file_id: "file-1",
		}),
		setFileInfoCache,
		t: (key) => key,
	})
	return { result, setFileInfoCache }
}

describe("processBatchSavedFiles path resolution", () => {
	it.each([
		["/画布A/images/x.png", "画布A/images", "画布A", "./images/x.png"],
		["/images/x.png", "画布A/images", "画布A", "/images/x.png"],
		["画布B/images/x.png", "画布A/images", "画布A", "/画布B/images/x.png"],
		["images/x.png", "画布A/images", "画布A", "./images/x.png"],
		[undefined, "画布A/images", "画布A", "./images/x.png"],
	])(
		"derives storage path %s as %s",
		async (relativeFilePath, suffixDir, designProjectBasePath, expectedPath) => {
			const { result, setFileInfoCache } = await processPath({
				relativeFilePath,
				suffixDir,
				designProjectBasePath,
			})

			expect(result.errors).toEqual([])
			expect(result.responses[0]?.path).toBe(expectedPath)
			expect(setFileInfoCache).toHaveBeenCalledWith(expectedPath, expect.any(Object), {
				allowMissingAttachment: true,
			})
		},
	)

	it("fails the file instead of persisting a traversal path", async () => {
		const { result, setFileInfoCache } = await processPath({
			relativeFilePath: "../images/x.png",
			suffixDir: "画布A/images",
			designProjectBasePath: "画布A",
		})

		expect(result.responses).toEqual([])
		expect(result.errors).toHaveLength(1)
		expect(setFileInfoCache).not.toHaveBeenCalled()
	})
})
