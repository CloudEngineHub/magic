import { describe, expect, it, vi } from "vitest"
import { CanvasFileUploadManager, type UploadRequest } from "../upload/CanvasFileUploadManager"
import {
	UploadSubDir,
	type UploadFile,
	type UploadFileResponse,
	type UploadSubDirType,
} from "../../../public/magic-types"
import type { CanvasElementClipboardFileMetadata } from "../clipboard/CanvasElementClipboard"

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

describe("CanvasFileUploadManager upload queue", () => {
	it("settles each queued upload request only once when batch upload rejects after per-file callbacks", async () => {
		const firstFailure = new Error("first failed")
		const batchFailure = new Error("batch failed")
		const uploadFiles = vi.fn(async (files: UploadFile[]) => {
			files[0]?.onUploadFailed(firstFailure)
			throw batchFailure
		})
		const firstRequest: UploadRequest = {
			file: new File(["first"], "first.png", { type: "image/png" }),
			onUploadComplete: vi.fn(),
			onUploadFailed: vi.fn(),
		}
		const secondRequest: UploadRequest = {
			file: new File(["second"], "second.png", { type: "image/png" }),
			onUploadComplete: vi.fn(),
			onUploadFailed: vi.fn(),
		}
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: {
				magicConfigManager: {
					config: {
						methods: {
							uploadFiles: typeof uploadFiles
						}
					}
				}
			}
			uploadQueue: UploadRequest[]
			isProcessingQueue: boolean
			currentReferenceImages?: string[]
			processQueue: () => Promise<void>
		}
		manager.canvas = {
			magicConfigManager: {
				config: {
					methods: { uploadFiles },
				},
			},
		}
		manager.uploadQueue = [firstRequest, secondRequest]
		manager.isProcessingQueue = false

		await manager.processQueue()

		expect(firstRequest.onUploadFailed).toHaveBeenCalledTimes(1)
		expect(firstRequest.onUploadFailed).toHaveBeenCalledWith(firstFailure)
		expect(secondRequest.onUploadFailed).toHaveBeenCalledTimes(1)
		expect(secondRequest.onUploadFailed).toHaveBeenCalledWith(expect.any(Error))
		expect(vi.mocked(secondRequest.onUploadFailed).mock.calls[0]?.[0].message).toBe(
			"batch failed",
		)
		expect(firstRequest.onUploadComplete).not.toHaveBeenCalled()
		expect(secondRequest.onUploadComplete).not.toHaveBeenCalled()
		expect(manager.isProcessingQueue).toBe(false)
	})
})

describe("CanvasFileUploadManager remote resource load deferrals", () => {
	it("defers resource loads until all registrations for the same path are released", () => {
		const emit = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: {
				id: string
				eventEmitter: { emit: ReturnType<typeof vi.fn> }
			}
			pendingRemoteResourceLoadDeferrals: Map<string, number>
			registerPendingRemoteResourceLoadDeferral: CanvasFileUploadManager["registerPendingRemoteResourceLoadDeferral"]
			shouldDeferRemoteResourceLoad: CanvasFileUploadManager["shouldDeferRemoteResourceLoad"]
			getRemoteResourceLoadDeferralKey: CanvasFileUploadManager["getRemoteResourceLoadDeferralKey"]
		}
		manager.canvas = {
			id: "target-canvas",
			eventEmitter: { emit },
		}
		manager.pendingRemoteResourceLoadDeferrals = new Map()

		const releaseA = manager.registerPendingRemoteResourceLoadDeferral("./videos/reference.mp4")
		const releaseB = manager.registerPendingRemoteResourceLoadDeferral("videos/reference.mp4")

		expect(manager.shouldDeferRemoteResourceLoad("./videos/reference.mp4")).toBe(true)
		expect(manager.shouldDeferRemoteResourceLoad("videos/reference.mp4")).toBe(true)
		expect(manager.shouldDeferRemoteResourceLoad("https://example.test/reference.mp4")).toBe(
			false,
		)

		releaseA()
		expect(manager.shouldDeferRemoteResourceLoad("./videos/reference.mp4")).toBe(true)
		expect(emit).not.toHaveBeenCalled()

		releaseB()
		expect(manager.shouldDeferRemoteResourceLoad("./videos/reference.mp4")).toBe(false)
		expect(emit).toHaveBeenCalledTimes(1)
		expect(emit).toHaveBeenCalledWith({
			type: "resource:remote-load-deferral-released",
			data: {
				path: "videos/reference.mp4",
				key: "videos/reference.mp4",
			},
		})

		releaseB()
		expect(emit).toHaveBeenCalledTimes(1)
	})
})

describe("CanvasFileUploadManager remote resource transfer cache", () => {
	it("reuses completed element media transfers without creating another upload", async () => {
		const result: UploadFileResponse = {
			path: "target/videos/video.mp4",
			src: "https://target.test/video.mp4",
			fileName: "video.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: {
				id: string
				magicConfigManager: {
					config: {
						methods: {
							uploadFiles: ReturnType<typeof vi.fn>
						}
					}
				}
			}
			currentPendingBatchId: string | null
			remoteResourceTransfers: Map<string, unknown>
			getReusableCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			getRemoteResourceTransferKey: ReturnType<typeof vi.fn>
			createRemoteResourceTransferPromise: ReturnType<typeof vi.fn>
			persistCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			transferRemoteResource: CanvasFileUploadManager["transferRemoteResource"]
		}
		manager.canvas = {
			id: "target-canvas",
			magicConfigManager: {
				config: {
					methods: {
						uploadFiles: vi.fn(),
					},
				},
			},
		}
		manager.currentPendingBatchId = null
		manager.remoteResourceTransfers = new Map()
		manager.getReusableCompletedRemoteResourceTransfer = vi.fn(async () => result)
		manager.getRemoteResourceTransferKey = vi.fn(() => "transfer-key")
		manager.createRemoteResourceTransferPromise = vi.fn(async () => result)
		manager.persistCompletedRemoteResourceTransfer = vi.fn()

		await expect(
			manager.transferRemoteResource({
				sourceCanvasId: "source-canvas",
				metadata: {
					id: "file-1",
					elementId: "source-video",
					filename: "video.mp4",
					mimeType: "video/mp4",
					fileSize: 0,
					role: "element-media",
					sourceRef: {
						src: "./videos/video.mp4",
						ossUrl: "https://source.test/video.mp4",
					},
				},
			}),
		).resolves.toBe(result)

		expect(manager.getReusableCompletedRemoteResourceTransfer).toHaveBeenCalledWith({
			sourceCanvasId: "source-canvas",
			metadata: expect.objectContaining({
				role: "element-media",
				sourceRef: expect.objectContaining({
					src: "./videos/video.mp4",
				}),
			}),
			allowFileInfoFallback: true,
		})
		expect(manager.createRemoteResourceTransferPromise).not.toHaveBeenCalled()
	})

	it("uploads element media when no completed transfer is reusable", async () => {
		const result: UploadFileResponse = {
			path: "target/videos/video.mp4",
			src: "https://target.test/video.mp4",
			fileName: "video.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: {
				id: string
				magicConfigManager: {
					config: {
						methods: {
							uploadFiles: ReturnType<typeof vi.fn>
						}
					}
				}
			}
			currentPendingBatchId: string | null
			remoteResourceTransfers: Map<string, unknown>
			getReusableCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			getRemoteResourceTransferKey: ReturnType<typeof vi.fn>
			createRemoteResourceTransferPromise: ReturnType<typeof vi.fn>
			persistCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			transferRemoteResource: CanvasFileUploadManager["transferRemoteResource"]
		}
		manager.canvas = {
			id: "target-canvas",
			magicConfigManager: {
				config: {
					methods: {
						uploadFiles: vi.fn(),
					},
				},
			},
		}
		manager.currentPendingBatchId = null
		manager.remoteResourceTransfers = new Map()
		manager.getReusableCompletedRemoteResourceTransfer = vi.fn(async () => null)
		manager.getRemoteResourceTransferKey = vi.fn(() => "transfer-key")
		manager.createRemoteResourceTransferPromise = vi.fn(async () => result)
		manager.persistCompletedRemoteResourceTransfer = vi.fn()

		await expect(
			manager.transferRemoteResource({
				sourceCanvasId: "source-canvas",
				metadata: {
					id: "file-1",
					elementId: "source-video",
					filename: "video.mp4",
					mimeType: "video/mp4",
					fileSize: 0,
					role: "element-media",
					sourceRef: {
						src: "./videos/video.mp4",
						ossUrl: "https://source.test/video.mp4",
					},
				},
			}),
		).resolves.toBe(result)

		expect(manager.getReusableCompletedRemoteResourceTransfer).toHaveBeenCalledWith({
			sourceCanvasId: "source-canvas",
			metadata: expect.objectContaining({
				role: "element-media",
				sourceRef: expect.objectContaining({
					src: "./videos/video.mp4",
				}),
			}),
			allowFileInfoFallback: true,
		})
		expect(manager.createRemoteResourceTransferPromise).toHaveBeenCalled()
	})

	it("reuses completed generation resource transfers without creating another upload", async () => {
		const result: UploadFileResponse = {
			path: "target/videos/reference.mp4",
			src: "https://target.test/reference.mp4",
			fileName: "reference.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: {
				id: string
				magicConfigManager: {
					config: {
						methods: {
							uploadFiles: ReturnType<typeof vi.fn>
						}
					}
				}
			}
			currentPendingBatchId: string | null
			remoteResourceTransfers: Map<string, unknown>
			getReusableCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			getRemoteResourceTransferKey: ReturnType<typeof vi.fn>
			createRemoteResourceTransferPromise: ReturnType<typeof vi.fn>
			persistCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			transferRemoteResource: CanvasFileUploadManager["transferRemoteResource"]
		}
		manager.canvas = {
			id: "target-canvas",
			magicConfigManager: {
				config: {
					methods: {
						uploadFiles: vi.fn(),
					},
				},
			},
		}
		manager.currentPendingBatchId = null
		manager.remoteResourceTransfers = new Map()
		manager.getReusableCompletedRemoteResourceTransfer = vi.fn(async () => result)
		manager.getRemoteResourceTransferKey = vi.fn(() => "transfer-key")
		manager.createRemoteResourceTransferPromise = vi.fn(async () => result)
		manager.persistCompletedRemoteResourceTransfer = vi.fn()

		await expect(
			manager.transferRemoteResource({
				sourceCanvasId: "source-canvas",
				metadata: {
					id: "generation-resource:0",
					elementId: "generation-resource:0",
					filename: "reference.mp4",
					mimeType: "video/mp4",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "./videos/reference.mp4",
					sourceRef: {
						src: "./videos/reference.mp4",
						ossUrl: "https://source.test/reference.mp4",
					},
				},
			}),
		).resolves.toBe(result)

		expect(manager.getReusableCompletedRemoteResourceTransfer).toHaveBeenCalledWith({
			sourceCanvasId: "source-canvas",
			metadata: expect.objectContaining({
				role: "generation-resource",
				resourcePath: "./videos/reference.mp4",
			}),
			allowFileInfoFallback: false,
		})
		expect(manager.createRemoteResourceTransferPromise).not.toHaveBeenCalled()
	})

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
			expires_at: "2030-01-01 00:00:00",
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
			expires_at: "2030-01-01 00:00:00",
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
			expires_at: "2030-01-01 00:00:00",
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

	it("trusts completed transfers without getFileInfo when fallback is disabled", async () => {
		const metadata: CanvasElementClipboardFileMetadata = {
			id: "generation-resource:0",
			elementId: "generation-resource:0",
			filename: "reference.mp4",
			mimeType: "video/mp4",
			fileSize: 0,
			role: "generation-resource",
			resourcePath: "./videos/reference.mp4",
			sourceRef: {
				src: "./videos/reference.mp4",
				ossUrl: "https://source.test/reference.mp4",
			},
		}
		const result: UploadFileResponse = {
			path: "target/videos/reference.mp4",
			src: "https://target.test/reference.mp4",
			fileName: "reference.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const getFileInfo = vi.fn(async () => {
			throw new Error("file not found")
		})
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
				allowFileInfoFallback: false,
			}),
		).resolves.toBe(result)

		expect(getFileInfo).not.toHaveBeenCalled()
	})

	it("trusts generation resource cache when file info fallback is disabled", async () => {
		const metadata: CanvasElementClipboardFileMetadata = {
			id: "generation-resource:0",
			elementId: "generation-resource:0",
			filename: "reference.mp4",
			mimeType: "video/mp4",
			fileSize: 0,
			role: "generation-resource",
			resourcePath: "./videos/reference.mp4",
			sourceRef: {
				src: "./videos/reference.mp4",
				ossUrl: "https://source.test/reference.mp4",
			},
		}
		const result: UploadFileResponse = {
			path: "target/videos/reference.mp4",
			src: "https://target.test/reference.mp4",
			fileName: "reference.mp4",
			expires_at: "2030-01-01 00:00:00",
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
				allowFileInfoFallback: false,
			}),
		).resolves.toBe(result)

		expect(getFileResourceMeta).not.toHaveBeenCalled()
		expect(getFileInfo).not.toHaveBeenCalled()
		expect(manager.remoteResourceTransfers.size).toBe(1)
	})
})
