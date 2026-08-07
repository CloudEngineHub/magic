import { describe, expect, it, vi } from "vitest"
import { CanvasFileUploadManager, type UploadRequest } from "../upload/CanvasFileUploadManager"
import {
	GenerationStatus,
	UploadSubDir,
	type UploadFile,
	type UploadFileResponse,
	type UploadSubDirType,
} from "../../../public/magic-types"
import type { CanvasElementClipboardFileMetadata } from "../clipboard/CanvasElementClipboard"
import { createTestResourceReferenceResolver } from "../../../public/__tests__/testResourceReferenceResolver"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import { ImageElement } from "../../elements/image/ImageElement"

const resolveDesignAResourceReference = createTestResourceReferenceResolver()

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
			`target-canvas:${options.sourceCanvasId}:${
				options.metadata.resourceIdentity || options.metadata.sourceRef?.src
			}`,
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

describe("CanvasFileUploadManager image replacement", () => {
	function createImageInstance(status = GenerationStatus.Completed, options?: { v2?: boolean }) {
		const instance = Object.create(ImageElement.prototype) as ImageElement
		const version = { id: "version-1", status }
		const data = options?.v2
			? {
					id: "image-1",
					type: ElementTypeEnum.Image,
					imageDslVersion: 2 as const,
					activeVersionId: version.id,
					mainVersionId: version.id,
					versions: [version],
				}
			: { id: "image-1", type: ElementTypeEnum.Image, status }
		Object.assign(instance, {
			getData: vi.fn(() => data),
			getActiveVersionData: vi.fn(() => version),
			getVersionData: vi.fn((versionId: string) =>
				options?.v2 && versionId === version.id ? version : undefined,
			),
			updateActiveVersionData: vi.fn(() => true),
			updateVersionData: vi.fn(() => true),
			setOssSrc: vi.fn(),
		})
		return instance
	}

	it("replaces only the active image version after upload and records one history entry", async () => {
		const image = createImageInstance()
		const disable = vi.fn()
		const enable = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const primeCache = vi.fn()
		const requestImmediateImageLoad = vi.fn()
		const removeMarkersByImageVersion = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		const uploadResult: UploadFileResponse = {
			path: "./images/new.png",
			src: "https://example.test/new.png",
			fileName: "new.png",
		}
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { getElementInstance: vi.fn(() => image) },
				historyManager: { disable, enable, recordHistoryImmediate },
				imageResourceManager: { primeCache },
				markerManager: { removeMarkersByImageVersion },
				visibilityManager: { requestImmediateImageLoad },
			},
			uploadDirect: vi.fn(async () => [uploadResult]),
		})

		await expect(
			manager.replaceImageElement({
				elementId: "image-1",
				file: new File(["new"], "new.png", { type: "image/png" }),
				versionId: null,
			}),
		).resolves.toBe(true)

		expect(image.updateActiveVersionData).toHaveBeenCalledWith(
			{
				src: "./images/new.png",
				status: GenerationStatus.Completed,
				errorMessage: undefined,
				crop: undefined,
			},
			{ silent: false },
		)
		expect(image.setOssSrc).toHaveBeenCalledWith("https://example.test/new.png")
		expect(primeCache).toHaveBeenCalledWith("./images/new.png", uploadResult)
		expect(disable).toHaveBeenCalledTimes(1)
		expect(enable).toHaveBeenCalledTimes(1)
		expect(recordHistoryImmediate).toHaveBeenCalledTimes(1)
		expect(removeMarkersByImageVersion).toHaveBeenCalledWith("image-1", null)
		expect(requestImmediateImageLoad).toHaveBeenCalledWith("image-1", {
			reason: "image-replaced",
			priority: "critical",
		})
	})

	it("replaces the active image version with an existing project path", () => {
		const image = createImageInstance()
		const removeMarkersByImageVersion = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { getElementInstance: vi.fn(() => image) },
				historyManager: {
					disable: vi.fn(),
					enable: vi.fn(),
					recordHistoryImmediate: vi.fn(),
				},
				markerManager: { removeMarkersByImageVersion },
				visibilityManager: { requestImmediateImageLoad: vi.fn() },
			},
		})

		expect(
			manager.replaceImageElementFromProject({
				elementId: "image-1",
				path: "/images/project.webp",
				versionId: null,
			}),
		).toBe(true)
		expect(image.updateActiveVersionData).toHaveBeenCalledWith(
			expect.objectContaining({ src: "/images/project.webp", crop: undefined }),
			{ silent: false },
		)
		expect(removeMarkersByImageVersion).toHaveBeenCalledWith("image-1", null)
	})

	it("targets the V2 version that was active when replacement started", () => {
		const image = createImageInstance(GenerationStatus.Completed, { v2: true })
		const removeMarkersByImageVersion = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { getElementInstance: vi.fn(() => image) },
				historyManager: {
					disable: vi.fn(),
					enable: vi.fn(),
					recordHistoryImmediate: vi.fn(),
				},
				markerManager: { removeMarkersByImageVersion },
				visibilityManager: { requestImmediateImageLoad: vi.fn() },
			},
		})

		expect(
			manager.replaceImageElementFromProject({
				elementId: "image-1",
				path: "/images/project.png",
				versionId: "version-1",
			}),
		).toBe(true)
		expect(image.updateVersionData).toHaveBeenCalledWith(
			"version-1",
			expect.objectContaining({ src: "/images/project.png", crop: undefined }),
			{ silent: false },
		)
		expect(image.updateActiveVersionData).not.toHaveBeenCalled()
		expect(removeMarkersByImageVersion).toHaveBeenCalledWith("image-1", "version-1")
	})

	it("does not upload over an active processing image version", async () => {
		const image = createImageInstance(GenerationStatus.Processing)
		const uploadDirect = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { getElementInstance: vi.fn(() => image) },
			},
			uploadDirect,
		})

		await expect(
			manager.replaceImageElement({
				elementId: "image-1",
				file: new File(["new"], "new.png", { type: "image/png" }),
				versionId: null,
			}),
		).resolves.toBe(false)
		expect(uploadDirect).not.toHaveBeenCalled()
		expect(image.updateActiveVersionData).not.toHaveBeenCalled()
	})
})

describe("CanvasFileUploadManager audio element uploads", () => {
	it("creates a temporary audio placeholder before upload and converts it after success", async () => {
		let uploadContext:
			| {
					onUploadComplete?: (elementId: string, result: UploadFileResponse) => void
					onUploadFailed?: (elementId: string, error: Error) => void
			  }
			| undefined
		const createTemporary = vi.fn(
			(
				_element: LayerElement,
				context: {
					onUploadComplete?: (elementId: string, result: UploadFileResponse) => void
					onUploadFailed?: (elementId: string, error: Error) => void
				},
			) => {
				uploadContext = context
			},
		)
		const convertToPermament = vi.fn()
		const disable = vi.fn()
		const enable = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const primeCache = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			pendingUploadBatches: [],
			currentPendingBatchId: null,
			canvas: {
				eventEmitter: { emit: vi.fn() },
				magicConfigManager: { config: { methods: { uploadFiles: vi.fn() } } },
				elementManager: {
					getElementsDict: vi.fn(() => ({})),
					getMaxZIndexInLevel: vi.fn(() => 2),
					createTemporary,
					hasElement: vi.fn(() => true),
					isTemporary: vi.fn(() => true),
					convertToPermament,
				},
				historyManager: { disable, enable, recordHistoryImmediate },
				audioResourceManager: { primeCache },
			},
		})
		const onUploadComplete = vi.fn()
		const file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" })

		const pending = manager.uploadFileElement({
			file,
			position: { x: 300, y: 200 },
			onUploadComplete,
		})
		expect(createTemporary).toHaveBeenCalledTimes(1)
		const temporaryElement = createTemporary.mock.calls[0]?.[0] as Record<string, unknown>
		expect(temporaryElement).toMatchObject({
			type: ElementTypeEnum.Audio,
			width: 1280,
			height: 720,
		})
		expect(temporaryElement.src).toBeUndefined()
		expect(temporaryElement).not.toHaveProperty("status")
		expect(temporaryElement).not.toHaveProperty("errorMessage")
		expect(disable).toHaveBeenCalledTimes(1)
		expect(enable).toHaveBeenCalledTimes(1)
		expect(recordHistoryImmediate).not.toHaveBeenCalled()
		const elementId = temporaryElement.id as string
		await expect(pending).resolves.toBe(elementId)
		expect(convertToPermament).not.toHaveBeenCalled()

		const uploadResult: UploadFileResponse = {
			path: "./audios/voice.mp3",
			src: "https://example.test/voice.mp3",
			fileName: "voice.mp3",
		}
		uploadContext?.onUploadComplete?.(elementId, uploadResult)

		expect(convertToPermament).toHaveBeenCalledWith(
			elementId,
			{ src: "./audios/voice.mp3" },
			{ silent: true },
		)
		expect(primeCache).toHaveBeenCalledWith("./audios/voice.mp3", uploadResult)
		expect(disable).toHaveBeenCalledTimes(1)
		expect(enable).toHaveBeenCalledTimes(1)
		expect(recordHistoryImmediate).toHaveBeenCalledTimes(1)
		expect(onUploadComplete).toHaveBeenCalledWith(elementId, uploadResult)
	})

	it("returns the audio placeholder before a locked upload queue is released", async () => {
		const uploadResult: UploadFileResponse = {
			path: "./audios/voice.mp3",
			src: "https://example.test/voice.mp3",
			fileName: "voice.mp3",
		}
		const uploadFiles = vi.fn(async (files: UploadFile[]) => {
			files[0]?.onUploadComplete(uploadResult)
			return [uploadResult]
		})
		const convertToPermament = vi.fn()
		const primeCache = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		const createTemporary = vi.fn(
			(
				element: LayerElement,
				context: {
					uploadFiles: File[]
					onUploadComplete?: (elementId: string, result: UploadFileResponse) => void
					onUploadFailed?: (elementId: string, error: Error) => void
				},
			) => {
				manager.queueUpload({
					elementId: element.id,
					file: context.uploadFiles[0],
					onUploadComplete: (result) => context.onUploadComplete?.(element.id, result),
					onUploadFailed: (error) => context.onUploadFailed?.(element.id, error),
				})
			},
		)
		Object.assign(manager as unknown as Record<string, unknown>, {
			isLocked: false,
			isProcessingQueue: false,
			uploadQueue: [],
			pendingUploadBatches: [],
			currentPendingBatchId: null,
			canvas: {
				eventEmitter: { emit: vi.fn() },
				magicConfigManager: { config: { methods: { uploadFiles } } },
				elementManager: {
					getElementsDict: vi.fn(() => ({})),
					getMaxZIndexInLevel: vi.fn(() => 0),
					createTemporary,
					hasElement: vi.fn(() => true),
					isTemporary: vi.fn(() => true),
					convertToPermament,
				},
				historyManager: {
					disable: vi.fn(),
					enable: vi.fn(),
					recordHistoryImmediate: vi.fn(),
				},
				audioResourceManager: { primeCache },
			},
		})

		manager.lock()
		const elementId = await manager.uploadFileElement({
			file: new File(["audio"], "voice.mp3", { type: "audio/mpeg" }),
			position: { x: 0, y: 0 },
			manageHistory: false,
		})

		expect(elementId).toEqual(expect.any(String))
		expect(createTemporary).toHaveBeenCalledTimes(1)
		expect(createTemporary.mock.calls[0]?.[1]).not.toHaveProperty("overwrite")
		expect(uploadFiles).not.toHaveBeenCalled()

		await manager.unlock()

		expect(uploadFiles).toHaveBeenCalledTimes(1)
		expect(uploadFiles.mock.calls[0]?.[0]?.[0]?.overwrite).toBe(true)
		expect(convertToPermament).toHaveBeenCalledWith(
			elementId,
			{ src: "./audios/voice.mp3" },
			{ silent: true },
		)
		expect(primeCache).toHaveBeenCalledWith("./audios/voice.mp3", uploadResult)
	})

	it("replaces only the audio source after upload succeeds and records one history entry", async () => {
		const update = vi.fn()
		const disable = vi.fn()
		const enable = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const primeCache = vi.fn()
		const invalidatePath = vi.fn()
		const release = vi.fn()
		const invalidateAudioLoadRequest = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		const current = {
			id: "audio-1",
			type: ElementTypeEnum.Audio,
			x: 10,
			y: 20,
			width: 640,
			height: 720,
			name: "原名称",
			src: "./audios/old.mp3",
		}
		const uploadResult: UploadFileResponse = {
			path: "./audios/new.mp3",
			src: "https://example.test/new.mp3",
			fileName: "new.mp3",
		}
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { getElementData: vi.fn(() => current), update },
				historyManager: { disable, enable, recordHistoryImmediate },
				audioResourceManager: {
					getResourceIdentity: vi.fn((path: string) => path),
					primeCache,
				},
				audioPlaybackManager: { release },
				audioWaveformManager: { invalidatePath },
				visibilityManager: { invalidateAudioLoadRequest },
			},
			uploadDirect: vi.fn(async () => [uploadResult]),
		})

		await expect(
			manager.replaceAudioElement({
				elementId: "audio-1",
				file: new File(["new"], "new.mp3", { type: "audio/mpeg" }),
			}),
		).resolves.toBe(true)

		expect(update).toHaveBeenCalledWith(
			"audio-1",
			{ src: "./audios/new.mp3" },
			{ silent: false },
		)
		expect(primeCache).toHaveBeenCalledWith("./audios/new.mp3", uploadResult)
		expect(release).toHaveBeenCalledWith("audio-1")
		expect(invalidatePath).toHaveBeenCalledWith("./audios/old.mp3")
		expect(disable).toHaveBeenCalledTimes(1)
		expect(enable).toHaveBeenCalledTimes(1)
		expect(recordHistoryImmediate).toHaveBeenCalledTimes(1)
	})

	it("keeps the previous audio unchanged when replacement upload fails", async () => {
		const update = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: {
					getElementData: vi.fn(() => ({
						id: "audio-1",
						type: ElementTypeEnum.Audio,
						src: "./audios/old.mp3",
					})),
					update,
				},
				historyManager: { recordHistoryImmediate },
			},
			uploadDirect: vi.fn(async () => {
				throw new Error("upload failed")
			}),
		})

		await expect(
			manager.replaceAudioElement({
				elementId: "audio-1",
				file: new File(["new"], "new.mp3", { type: "audio/mpeg" }),
			}),
		).rejects.toThrow("upload failed")
		expect(update).not.toHaveBeenCalled()
		expect(recordHistoryImmediate).not.toHaveBeenCalled()
	})

	it("replaces audio with an existing project path without uploading", () => {
		const update = vi.fn()
		const disable = vi.fn()
		const enable = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const release = vi.fn()
		const invalidatePath = vi.fn()
		const invalidateAudioLoadRequest = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: {
					getElementData: vi.fn(() => ({
						id: "audio-1",
						type: ElementTypeEnum.Audio,
						src: "./audios/old.mp3",
					})),
					update,
				},
				historyManager: { disable, enable, recordHistoryImmediate },
				audioResourceManager: {
					getResourceIdentity: vi.fn((path: string) => path),
				},
				audioPlaybackManager: { release },
				audioWaveformManager: { invalidatePath },
				visibilityManager: { invalidateAudioLoadRequest },
			},
		})

		expect(
			manager.replaceAudioElementFromProject({
				elementId: "audio-1",
				path: "/audios/project.m4a",
			}),
		).toBe(true)

		expect(update).toHaveBeenCalledWith(
			"audio-1",
			{ src: "/audios/project.m4a" },
			{ silent: false },
		)
		expect(release).toHaveBeenCalledWith("audio-1")
		expect(invalidatePath).toHaveBeenCalledWith("./audios/old.mp3")
		expect(recordHistoryImmediate).toHaveBeenCalledTimes(1)
	})

	it("rejects a non-audio project path before changing the element", () => {
		const update = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			canvas: {
				t: vi.fn((_key: string, fallback: string) => fallback),
				elementManager: { update },
			},
		})

		expect(() =>
			manager.replaceAudioElementFromProject({
				elementId: "audio-1",
				path: "/images/not-audio.png",
			}),
		).toThrow("不支持的音频格式")
		expect(update).not.toHaveBeenCalled()
	})

	it("returns the audio placeholder immediately and removes it without history on failure", async () => {
		let uploadContext:
			| {
					onUploadFailed?: (elementId: string, error: Error) => void
			  }
			| undefined
		let hasElement = true
		const createTemporary = vi.fn(
			(
				_element: LayerElement,
				context: { onUploadFailed?: (elementId: string, error: Error) => void },
			) => {
				uploadContext = context
			},
		)
		const deleteElement = vi.fn(() => {
			hasElement = false
		})
		const disable = vi.fn()
		const enable = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const manager = Object.create(CanvasFileUploadManager.prototype) as CanvasFileUploadManager
		Object.assign(manager as unknown as Record<string, unknown>, {
			pendingUploadBatches: [],
			currentPendingBatchId: null,
			canvas: {
				eventEmitter: { emit: vi.fn() },
				magicConfigManager: { config: { methods: { uploadFiles: vi.fn() } } },
				elementManager: {
					getElementsDict: vi.fn(() => ({})),
					getMaxZIndexInLevel: vi.fn(() => 0),
					createTemporary,
					hasElement: vi.fn(() => hasElement),
					delete: deleteElement,
				},
				historyManager: { disable, enable, recordHistoryImmediate },
				audioResourceManager: { primeCache: vi.fn() },
			},
		})
		const onUploadFailed = vi.fn()
		const pending = manager.uploadFileElement({
			file: new File(["audio"], "voice.mp3", { type: "audio/mpeg" }),
			position: { x: 0, y: 0 },
			onUploadFailed,
		})
		const temporaryElement = createTemporary.mock.calls[0]?.[0] as Record<string, unknown>
		await expect(pending).resolves.toBe(temporaryElement.id)
		expect(deleteElement).not.toHaveBeenCalled()
		const uploadError = new Error("upload failed")
		uploadContext?.onUploadFailed?.(temporaryElement.id as string, uploadError)

		expect(deleteElement).toHaveBeenCalledWith(temporaryElement.id)
		expect(disable).toHaveBeenCalledTimes(2)
		expect(enable).toHaveBeenCalledTimes(2)
		expect(recordHistoryImmediate).not.toHaveBeenCalled()
		expect(onUploadFailed).toHaveBeenCalledWith(temporaryElement.id, uploadError)
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
				magicConfigManager: {
					config: {
						methods: {
							resolveResourceReference: typeof resolveDesignAResourceReference
						}
					}
				}
			}
			pendingRemoteResourceLoadDeferrals: Map<string, number>
			registerPendingRemoteResourceLoadDeferral: CanvasFileUploadManager["registerPendingRemoteResourceLoadDeferral"]
			shouldDeferRemoteResourceLoad: CanvasFileUploadManager["shouldDeferRemoteResourceLoad"]
			getRemoteResourceLoadDeferralKey: CanvasFileUploadManager["getRemoteResourceLoadDeferralKey"]
		}
		manager.canvas = {
			id: "target-canvas",
			eventEmitter: { emit },
			magicConfigManager: {
				config: {
					methods: { resolveResourceReference: resolveDesignAResourceReference },
				},
			},
		}
		manager.pendingRemoteResourceLoadDeferrals = new Map()

		const releaseA = manager.registerPendingRemoteResourceLoadDeferral("./videos/reference.mp4")
		const releaseB = manager.registerPendingRemoteResourceLoadDeferral(
			"/画布A/videos/reference.mp4",
		)

		expect(manager.shouldDeferRemoteResourceLoad("./videos/reference.mp4")).toBe(true)
		expect(manager.shouldDeferRemoteResourceLoad("/画布A/videos/reference.mp4")).toBe(true)
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
				path: "/画布A/videos/reference.mp4",
				key: "workspace:/画布A/videos/reference.mp4",
			},
		})

		releaseB()
		expect(emit).toHaveBeenCalledTimes(1)
	})
})

describe("CanvasFileUploadManager remote resource transfer cache", () => {
	it("uses source resource identity to reuse transfers across path aliases and roles", () => {
		const manager = Object.create(CanvasFileUploadManager.prototype) as {
			canvas: { id: string }
			getRemoteResourceTransferKey: (
				options: Parameters<CanvasFileUploadManager["transferRemoteResource"]>[0],
			) => string | undefined
		}
		manager.canvas = { id: "target-canvas" }

		const elementMediaKey = manager.getRemoteResourceTransferKey({
			sourceCanvasId: "source-canvas",
			metadata: {
				id: "element-media",
				elementId: "source-image",
				filename: "image.png",
				mimeType: "image/png",
				fileSize: 0,
				role: "element-media",
				resourceIdentity: "workspace:/画布A/images/image.png",
				sourceRef: { src: "./images/image.png" },
			},
		})
		const generationResourceKey = manager.getRemoteResourceTransferKey({
			sourceCanvasId: "source-canvas",
			metadata: {
				id: "generation-resource:0",
				elementId: "generation-resource:0",
				filename: "image.png",
				mimeType: "image/png",
				fileSize: 0,
				role: "generation-resource",
				resourcePath: "/画布A/images/image.png",
				resourceIdentity: "workspace:/画布A/images/image.png",
				sourceRef: { src: "/画布A/images/image.png" },
			},
		})

		expect(elementMediaKey).toBe(
			"target-canvas:source-canvas:workspace:/画布A/images/image.png",
		)
		expect(generationResourceKey).toBe(elementMediaKey)
	})

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
