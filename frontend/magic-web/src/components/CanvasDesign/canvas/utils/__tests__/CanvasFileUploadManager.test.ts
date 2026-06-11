import { describe, expect, it, vi } from "vitest"
import { CanvasFileUploadManager } from "../CanvasFileUploadManager"
import { UploadSubDir, type UploadFileResponse, type UploadSubDirType } from "../../../types.magic"
import type { CanvasElementClipboardFileMetadata } from "../CanvasElementClipboard"

interface RemoteTransferHarness {
	canvas: {
		id: string
		magicConfigManager: {
			config: {
				methods: {
					getFileInfo: ReturnType<typeof vi.fn>
					getFileResourceMeta?: ReturnType<typeof vi.fn>
				}
			}
		}
	}
	remoteResourceTransfers: Map<
		string,
		{
			status: "completed"
			result: UploadFileResponse
		}
	>
	getReusableCompletedRemoteResourceTransfer: CanvasFileUploadManager["getReusableCompletedRemoteResourceTransfer"]
	getCompletedRemoteResourceTransfer: CanvasFileUploadManager["getCompletedRemoteResourceTransfer"]
}

function createRemoteTransferManager(options: {
	getFileInfo: ReturnType<typeof vi.fn>
	getFileResourceMeta?: ReturnType<typeof vi.fn>
	result: UploadFileResponse
	metadata: CanvasElementClipboardFileMetadata
	sourceCanvasId: string
}): RemoteTransferHarness {
	const manager = Object.create(CanvasFileUploadManager.prototype) as RemoteTransferHarness
	manager.canvas = {
		id: "target-canvas",
		magicConfigManager: {
			config: {
				methods: {
					getFileInfo: options.getFileInfo,
					getFileResourceMeta: options.getFileResourceMeta,
				},
			},
		},
	}
	manager.remoteResourceTransfers = new Map([
		[
			`target-canvas:${options.sourceCanvasId}:${options.metadata.sourceRef?.src}`,
			{
				status: "completed",
				result: options.result,
			},
		],
	])
	return manager
}

describe("CanvasFileUploadManager upload sub directories", () => {
	it("routes video and audio files to their asset directories", () => {
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			getUploadSubDir: (file: File) => UploadSubDirType
		}

		expect(
			manager.getUploadSubDir(new File(["video"], "clip.mp4", { type: "video/mp4" })),
		).toBe(UploadSubDir.Videos)
		expect(
			manager.getUploadSubDir(new File(["audio"], "voice.mp3", { type: "audio/mpeg" })),
		).toBe(UploadSubDir.Audios)
		expect(
			manager.getUploadSubDir(new File(["image"], "photo.png", { type: "image/png" })),
		).toBe(UploadSubDir.Images)
	})
})

describe("CanvasFileUploadManager remote resource transfer cache", () => {
	it("drops stale completed transfers so paste can re-upload deleted target files", async () => {
		const metadata: CanvasElementClipboardFileMetadata = {
			id: "file-1",
			elementId: "source-image",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			role: "element-media",
			sourceRef: {
				src: "source/images/image.png",
				ossUrl: "https://source.test/image.png",
			},
		}
		const result: UploadFileResponse = {
			path: "target/images/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: 0,
			source: "clipboard",
		}
		const getFileInfo = vi.fn(async () => {
			throw new Error("file not found")
		})
		const getFileResourceMeta = vi.fn(async () => ({
			status: "deleted" as const,
		}))
		const manager = createRemoteTransferManager({
			getFileInfo,
			getFileResourceMeta,
			result,
			metadata,
			sourceCanvasId: "source-canvas",
		})

		await expect(
			manager.getReusableCompletedRemoteResourceTransfer({
				sourceCanvasId: "source-canvas",
				metadata,
			}),
		).resolves.toBeNull()

		expect(getFileResourceMeta).toHaveBeenCalledWith("target/images/image.png", {
			useImageProcess: false,
		})
		expect(getFileInfo).not.toHaveBeenCalled()
		expect(manager.remoteResourceTransfers.size).toBe(0)
	})

	it("keeps completed transfers when the target path is still available", async () => {
		const metadata: CanvasElementClipboardFileMetadata = {
			id: "file-1",
			elementId: "source-image",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			role: "element-media",
			sourceRef: {
				src: "source/images/image.png",
				ossUrl: "https://source.test/image.png",
			},
		}
		const result: UploadFileResponse = {
			path: "target/images/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: 0,
			source: "clipboard",
		}
		const getFileInfo = vi.fn(async () => ({
			...result,
			src: "https://target.test/fresh-image.png",
		}))
		const getFileResourceMeta = vi.fn(async () => ({
			status: "exists" as const,
		}))
		const manager = createRemoteTransferManager({
			getFileInfo,
			getFileResourceMeta,
			result,
			metadata,
			sourceCanvasId: "source-canvas",
		})

		await expect(
			manager.getReusableCompletedRemoteResourceTransfer({
				sourceCanvasId: "source-canvas",
				metadata,
			}),
		).resolves.toBe(result)

		expect(getFileResourceMeta).toHaveBeenCalledWith("target/images/image.png", {
			useImageProcess: false,
		})
		expect(getFileInfo).not.toHaveBeenCalled()
		expect(manager.remoteResourceTransfers.size).toBe(1)
	})

	it("falls back to getFileInfo only when lightweight resource metadata is unavailable", async () => {
		const metadata: CanvasElementClipboardFileMetadata = {
			id: "file-1",
			elementId: "source-image",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			role: "element-media",
			sourceRef: {
				src: "source/images/image.png",
				ossUrl: "https://source.test/image.png",
			},
		}
		const result: UploadFileResponse = {
			path: "target/images/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: 0,
			source: "clipboard",
		}
		const getFileInfo = vi.fn(async () => ({
			...result,
			src: "https://target.test/fresh-image.png",
		}))
		const manager = createRemoteTransferManager({
			getFileInfo,
			result,
			metadata,
			sourceCanvasId: "source-canvas",
		})

		await expect(
			manager.getReusableCompletedRemoteResourceTransfer({
				sourceCanvasId: "source-canvas",
				metadata,
			}),
		).resolves.toBe(result)

		expect(getFileInfo).toHaveBeenCalledWith("target/images/image.png", {
			useImageProcess: false,
			forceRefresh: true,
		})
	})
})
