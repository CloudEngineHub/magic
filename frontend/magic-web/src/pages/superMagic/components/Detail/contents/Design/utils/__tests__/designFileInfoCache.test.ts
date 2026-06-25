import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import {
	clearAllFileInfoCache,
	cleanupFileInfoCache,
	flushFileInfoCachePersistenceForTests,
	getFileInfoById,
	getFileInfoByPath,
	getFileResourceMetaByPath,
	setFileInfoCache,
} from "../designFileInfoCache"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

function fileItem(
	partial: Partial<FileItem> & Pick<FileItem, "file_id">,
): FileItem & { relative_file_path: string } {
	return {
		is_directory: false,
		relative_file_path: "",
		file_name: "",
		...partial,
	}
}

describe("getFileResourceMetaByPath", () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		vi.useRealTimers()
		clearAllFileInfoCache()
		await flushFileInfoCachePersistenceForTests()
	})

	afterEach(async () => {
		vi.useRealTimers()
		clearAllFileInfoCache()
		await flushFileInfoCachePersistenceForTests()
	})

	it("returns metadata-only resource version without fetching a signed url", async () => {
		const files = [
			fileItem({
				file_id: "file-1",
				relative_file_path: "images/a.png",
				file_name: "a.png",
				updated_at: "2026-06-05 10:00:00",
				file_size: 1024,
			}),
		]

		const meta = await getFileResourceMetaByPath("images/a.png", files)

		expect(meta).toMatchObject({
			status: "exists",
			fileName: "a.png",
			resourceVersion: "file-1:2026-06-05 10:00:00:1024",
			updatedAt: "2026-06-05 10:00:00",
			contentLength: 1024,
		})
		expect(meta).not.toHaveProperty("file_id")
	})

	it("returns deleted only when an attachment snapshot exists", async () => {
		const files = [
			fileItem({
				file_id: "file-1",
				relative_file_path: "images/a.png",
			}),
		]

		await expect(getFileResourceMetaByPath("images/missing.png", files)).resolves.toEqual({
			status: "deleted",
		})
		await expect(getFileResourceMetaByPath("images/missing.png", [])).resolves.toEqual({
			status: "unknown",
		})
		await expect(
			getFileResourceMetaByPath("images/missing.png", [], {
				hasAttachmentSnapshot: true,
			}),
		).resolves.toEqual({
			status: "deleted",
		})
	})

	it("preserves raw get-file-url version but uses metadata-visible version for comparison", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-2",
				url: "https://example.test/b.png?signature=1",
				expires_at: "2026-06-05 17:10:30",
				version: "object-version-1",
				updated_at: "2026-06-05 10:00:00",
			},
		])

		const fileInfo = await getFileInfoById("file-2", "b.png", 2048)

		expect(fileInfo).toMatchObject({
			src: "https://example.test/b.png?signature=1",
			fileName: "b.png",
			file_id: "file-2",
			version: "object-version-1",
			resource_version: "file-2:2026-06-05 10:00:00:2048",
			updated_at: "2026-06-05 10:00:00",
			content_length: 2048,
		})
	})

	it("does not expose host file id in path-based file info", async () => {
		vi.useFakeTimers()
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-2",
				url: "https://example.test/b.png?signature=1",
				version: "object-version-1",
				updated_at: "2026-06-05 10:00:00",
			},
		])

		const fileInfoPromise = getFileInfoByPath("images/b.png", [
			fileItem({
				file_id: "file-2",
				relative_file_path: "images/b.png",
				file_name: "b.png",
				updated_at: "2026-06-05 10:00:00",
				file_size: 2048,
			}),
		])
		await vi.advanceTimersByTimeAsync(100)

		const fileInfo = await fileInfoPromise
		expect(fileInfo).toMatchObject({
			src: "https://example.test/b.png?signature=1",
			fileName: "b.png",
			version: "object-version-1",
			resource_version: "file-2:2026-06-05 10:00:00:2048",
			updated_at: "2026-06-05 10:00:00",
			content_length: 2048,
		})
		expect(fileInfo).not.toHaveProperty("file_id")
	})

	it("hydrates persisted path cache after a module reload", async () => {
		const files = [
			fileItem({
				file_id: "file-4",
				relative_file_path: "images/c.png",
				file_name: "c.png",
				updated_at: "2026-06-05 12:00:00",
				file_size: 4096,
			}),
		]
		const cachedSrc = "https://example.test/c.png?signature=cached"

		setFileInfoCache(
			"images/c.png",
			{
				src: cachedSrc,
				fileName: "c.png",
				expires_at: "2099-01-01T00:00:00Z",
				resource_version: "file-4:2026-06-05 12:00:00:4096",
				updated_at: "2026-06-05 12:00:00",
				content_length: 4096,
			},
			files,
			undefined,
			"project-1",
		)

		await flushFileInfoCachePersistenceForTests()
		vi.resetModules()
		const apiModule = await import("@/pages/superMagic/utils/api")
		vi.mocked(apiModule.getTemporaryDownloadUrl).mockClear()
		const cacheModule = await import("../designFileInfoCache")

		const fileInfo = await cacheModule.getFileInfoByPath("images/c.png", files, {
			designProjectId: "project-1",
		})

		expect(fileInfo?.src).toBe(cachedSrc)
		expect(apiModule.getTemporaryDownloadUrl).not.toHaveBeenCalled()
		cacheModule.clearAllFileInfoCache()
		await cacheModule.flushFileInfoCachePersistenceForTests()
	})

	it("does not delete restored path cache before attachments are ready", async () => {
		const files = [
			fileItem({
				file_id: "file-5",
				relative_file_path: "images/d.png",
				file_name: "d.png",
				updated_at: "2026-06-05 13:00:00",
				file_size: 8192,
			}),
		]
		const cachedSrc = "https://example.test/d.png?signature=cached"

		setFileInfoCache(
			"images/d.png",
			{
				src: cachedSrc,
				fileName: "d.png",
				expires_at: "2099-01-01T00:00:00Z",
				resource_version: "file-5:2026-06-05 13:00:00:8192",
				updated_at: "2026-06-05 13:00:00",
				content_length: 8192,
			},
			files,
			undefined,
			"project-1",
		)

		cleanupFileInfoCache([], "project-1")
		vi.mocked(getTemporaryDownloadUrl).mockClear()

		const fileInfo = await getFileInfoByPath("images/d.png", files, {
			designProjectId: "project-1",
		})

		expect(fileInfo?.src).toBe(cachedSrc)
		expect(getTemporaryDownloadUrl).not.toHaveBeenCalled()
	})

	it("returns missing immediately for a known empty attachment snapshot", async () => {
		vi.useFakeTimers()

		const fileInfoPromise = getFileInfoByPath("images/missing.png", [], {
			hasAttachmentSnapshot: true,
		})
		await vi.advanceTimersByTimeAsync(0)

		await expect(fileInfoPromise).resolves.toBeNull()
		expect(getTemporaryDownloadUrl).not.toHaveBeenCalled()
	})

	it("allows a previously missing path to load after attachments are restored", async () => {
		vi.useFakeTimers()

		const missingPromise = getFileInfoByPath("images/restored.png", [], {
			hasAttachmentSnapshot: true,
		})
		await vi.advanceTimersByTimeAsync(0)
		await expect(missingPromise).resolves.toBeNull()

		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-restored",
				url: "https://example.test/restored.png?signature=1",
			},
		])
		const restoredFiles = [
			fileItem({
				file_id: "file-restored",
				relative_file_path: "images/restored.png",
				file_name: "restored.png",
			}),
		]
		const restoredPromise = getFileInfoByPath("images/restored.png", restoredFiles, {
			hasAttachmentSnapshot: true,
		})
		await vi.advanceTimersByTimeAsync(100)

		await expect(restoredPromise).resolves.toMatchObject({
			src: "https://example.test/restored.png?signature=1",
			fileName: "restored.png",
		})
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("chunks large path-based get-file-url batches", async () => {
		vi.useRealTimers()
		const files = Array.from({ length: 250 }, (_, index) =>
			fileItem({
				file_id: `file-${index}`,
				relative_file_path: `images/${index}.png`,
				file_name: `${index}.png`,
				file_size: 1024,
			}),
		)
		vi.mocked(getTemporaryDownloadUrl).mockImplementation(async ({ file_ids }) =>
			file_ids.map((fileId) => ({
				file_id: fileId,
				url: `https://example.test/${fileId}.png?signature=1`,
			})),
		)

		const promises = files.map((file) =>
			getFileInfoByPath(file.relative_file_path, files, {
				useImageProcess: true,
			}),
		)
		await new Promise((resolve) => setTimeout(resolve, 150))
		await expect(Promise.all(promises)).resolves.toHaveLength(250)

		const calls = vi.mocked(getTemporaryDownloadUrl).mock.calls
		expect(calls).toHaveLength(3)
		expect(calls.map(([request]) => request.file_ids.length)).toEqual([100, 100, 50])
		calls.forEach(([request]) => {
			expect(request.options).toBeDefined()
		})
	})

	it("uses strong resource version when attachment metadata exposes it", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-2",
				url: "https://example.test/b.png?signature=1",
				version: "object-version-1",
				updated_at: "2026-06-05 10:00:00",
			},
		])

		const fileInfo = await getFileInfoById("file-2", undefined, undefined, {
			filesList: [
				fileItem({
					file_id: "file-2",
					file_name: "b.png",
					resource_version: "attachment-version-1",
					updated_at: "2026-06-05 10:00:00",
					file_size: 2048,
				}),
			],
		})

		expect(fileInfo.resource_version).toBe("attachment-version-1")
		expect(fileInfo.version).toBe("object-version-1")
		expect(fileInfo.content_length).toBe(2048)
	})

	it("falls back to file id, updated_at and file size when get-file-url version is null", async () => {
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([
			{
				file_id: "file-3",
				url: "https://example.test/c.png?signature=1",
				version: null,
				updated_at: "2026-06-05 11:00:00",
			},
		])

		const fileInfo = await getFileInfoById("file-3", "c.png", 4096)

		expect(fileInfo.resource_version).toBe("file-3:2026-06-05 11:00:00:4096")
		expect(fileInfo.updated_at).toBe("2026-06-05 11:00:00")
		expect(fileInfo.content_length).toBe(4096)
	})
})
