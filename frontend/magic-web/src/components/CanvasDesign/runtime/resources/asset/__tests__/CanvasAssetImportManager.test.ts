import { afterEach, describe, expect, it, vi } from "vitest"
import { createTestResourceReferenceResolver } from "../../../../public/__tests__/testResourceReferenceResolver"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import { CanvasAssetImportManager, getAssetUploadSubDir } from "../CanvasAssetImportManager"
import { UploadSubDir, type CanvasAssetResourceInfo } from "../../../../public/magic-types"

vi.mock("../../../shared/placement/placementEngine", () => ({
	resolveConnectedPlacement: vi.fn(() => ({ x: 10, y: 20 })),
	resolveNearestFreeMediaPlacement: vi.fn(() => ({ x: 30, y: 40 })),
}))

interface CanvasHarnessOptions {
	elements?: LayerElement[]
	asset?: CanvasAssetResourceInfo
	connect?: ReturnType<typeof vi.fn>
	attachmentPathsByFileId?: Record<string, string>
	upstreamConnections?: Array<{
		id: string
		sourceElementId: string
		targetElementId: string
	}>
}

function createHarness(options: CanvasHarnessOptions = {}) {
	const target: LayerElement = {
		id: "video-target",
		type: ElementTypeEnum.Video,
		x: 500,
		y: 100,
		width: 1280,
		height: 720,
		activeContentId: "video-target-content",
		mainContentId: "video-target-content",
		contents: [{ contentId: "video-target-content" }],
	}
	const elements = new Map(
		[target, ...(options.elements ?? [])].map((element) => [element.id, element]),
	)
	const uploadResult = {
		path: "./audios/imported.mp3",
		src: "https://example.test/imported.mp3",
		fileName: "imported.mp3",
	}
	const uploadDirect = vi.fn(async () => [uploadResult])
	const upstreamConnections: Array<{
		id: string
		sourceElementId: string
		targetElementId: string
	}> = [...(options.upstreamConnections ?? [])]
	const connect =
		options.connect ??
		vi.fn(
			({
				sourceElementId,
				targetElementId,
			}: {
				sourceElementId: string
				targetElementId: string
			}) => {
				const connectionId = `connection-${sourceElementId}`
				upstreamConnections.push({ id: connectionId, sourceElementId, targetElementId })
				return { status: "created" as const, connectionId }
			},
		)
	const register = vi.fn(() => "seed-1")
	const canvas = {
		elementManager: {
			getAllElementIds: () => [...elements.keys()],
			getElementData: (elementId: string) => elements.get(elementId),
			getAllElements: () => [...elements.values()],
			getNextZIndexInLevel: () => 10,
			create: vi.fn((element: LayerElement) => {
				elements.set(element.id, element)
				return { elementId: element.id, element }
			}),
			delete: vi.fn((elementId: string) => elements.delete(elementId)),
		},
		canvasFileUploadManager: {
			isPendingResourcePath: vi.fn(() => false),
			uploadDirect,
		},
		magicConfigManager: {
			config: {
				methods: {
					resolveResourceReference: createTestResourceReferenceResolver({
						attachmentPathsByFileId: options.attachmentPathsByFileId ?? {
							existing: "./images/existing.png",
						},
						attachmentsReady: true,
					}),
				},
			},
		},
		assetResourceManager: {
			getResource: vi.fn(async () =>
				Promise.resolve(
					options.asset ?? {
						assetId: "asset-audio",
						mediaType: "audio",
						fileUrl: "https://example.test/source.mp3",
						fileName: "source",
					},
				),
			),
		},
		historyManager: {
			runTransaction: vi.fn((callback: () => unknown) => callback()),
		},
		connectionManager: {
			connectElements: connect,
			getUpstreamConnections: () => upstreamConnections,
		},
		connectionAssociationSeedManager: { register },
		geometryCacheManager: {
			getElementBounds: () => ({ x: 500, y: 100, width: 1280, height: 720 }),
		},
		imageResourceManager: { primeCache: vi.fn() },
		videoResourceManager: { primeCache: vi.fn() },
		audioResourceManager: { primeCache: vi.fn() },
	}
	return { canvas, elements, uploadDirect, connect, register, uploadResult }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("CanvasAssetImportManager", () => {
	it("maps asset media types to explicit upload directories", () => {
		expect(getAssetUploadSubDir("image")).toBe(UploadSubDir.Images)
		expect(getAssetUploadSubDir("video")).toBe(UploadSubDir.Videos)
		expect(getAssetUploadSubDir("audio")).toBe(UploadSubDir.Audios)
	})

	it("reuses a current-canvas binding and creates a new connected media element", async () => {
		const existingImage: LayerElement = {
			id: "existing-image",
			type: ElementTypeEnum.Image,
			width: 640,
			height: 360,
			activeContentId: "existing-content",
			mainContentId: "existing-content",
			contents: [
				{
					contentId: "existing-content",
					src: "./images/existing.png",
					assetId: "asset-image",
				},
			],
		}
		const harness = createHarness({ elements: [existingImage] })
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		const result = await manager.importAndConnect({
			assetId: "asset-image",
			targetElementId: "video-target",
			slot: { kind: "reference" },
			allowedMediaTypes: ["image"],
		})

		expect(result).toMatchObject({
			workspacePath: "./images/existing.png",
			mediaType: "image",
			source: "existing-binding",
		})
		expect(harness.canvas.assetResourceManager.getResource).not.toHaveBeenCalled()
		expect(harness.uploadDirect).not.toHaveBeenCalled()
		const created = harness.elements.get(result.elementId)
		expect(created).toMatchObject({
			type: ElementTypeEnum.Image,
			x: 10,
			y: 20,
			contents: [{ src: "./images/existing.png", assetId: "asset-image" }],
		})
		expect(harness.connect).toHaveBeenCalledWith({
			sourceElementId: result.elementId,
			targetElementId: "video-target",
		})
		expect(harness.register).toHaveBeenCalledWith(
			expect.objectContaining({
				targetElementId: "video-target",
				createdBy: "assets",
				orderedSources: [{ elementId: result.elementId, kind: "image" }],
			}),
		)
	})

	it("creates a standalone image element with the workspace binding", async () => {
		const existingImage: LayerElement = {
			id: "existing-image",
			type: ElementTypeEnum.Image,
			width: 640,
			height: 360,
			activeContentId: "existing-content",
			mainContentId: "existing-content",
			contents: [
				{
					contentId: "existing-content",
					src: "./images/existing.png",
					assetId: "asset-image",
				},
			],
		}
		const harness = createHarness({ elements: [existingImage] })
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		const result = await manager.importAndCreateElement({
			assetId: "asset-image",
			allowedMediaTypes: ["image"],
		})

		expect(result).toMatchObject({
			workspacePath: "./images/existing.png",
			mediaType: "image",
			source: "existing-binding",
		})
		expect(harness.canvas.elementManager.create).toHaveBeenCalledTimes(1)
		expect(harness.elements.get(result.elementId)).toMatchObject({
			type: ElementTypeEnum.Image,
			x: 30,
			y: 40,
			contents: [{ src: "./images/existing.png", assetId: "asset-image" }],
		})
	})

	it("reuses the existing connection when the asset is already connected to the target video", async () => {
		const existingImage: LayerElement = {
			id: "existing-image",
			type: ElementTypeEnum.Image,
			width: 640,
			height: 360,
			activeContentId: "existing-content",
			mainContentId: "existing-content",
			contents: [
				{
					contentId: "existing-content",
					src: "./images/existing.png",
					assetId: "asset-image",
				},
			],
		}
		const harness = createHarness({
			elements: [existingImage],
			upstreamConnections: [
				{
					id: "existing-connection",
					sourceElementId: "existing-image",
					targetElementId: "video-target",
				},
			],
		})
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		const result = await manager.importAndConnect({
			assetId: "asset-image",
			targetElementId: "video-target",
			slot: { kind: "reference" },
			allowedMediaTypes: ["image"],
		})

		expect(result).toMatchObject({
			elementId: "existing-image",
			connectionId: "existing-connection",
			workspacePath: "./images/existing.png",
			source: "existing-connection",
		})
		expect(harness.canvas.elementManager.create).not.toHaveBeenCalled()
		expect(harness.connect).not.toHaveBeenCalled()
		expect(harness.register).not.toHaveBeenCalled()
	})

	it("reuses a same-name current-canvas file before requiring a signed URL", async () => {
		const harness = createHarness({
			asset: {
				assetId: "asset-image",
				mediaType: "image",
				fileUrl: null,
				fileName: "portrait.png",
			},
			attachmentPathsByFileId: { portrait: "./images/portrait.png" },
		})
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		const result = await manager.importAndConnect({
			assetId: "asset-image",
			targetElementId: "video-target",
			slot: { kind: "reference" },
			allowedMediaTypes: ["image"],
		})

		expect(result).toMatchObject({
			workspacePath: "./images/portrait.png",
			fileName: "portrait.png",
			mediaType: "image",
			source: "existing-file",
		})
		expect(fetchMock).not.toHaveBeenCalled()
		expect(harness.uploadDirect).not.toHaveBeenCalled()
		expect(harness.elements.get(result.elementId)).toMatchObject({
			contents: [{ src: "./images/portrait.png", assetId: "asset-image" }],
		})
	})

	it("does not treat an unconnected canvas binding as an existing target connection", async () => {
		const existingImage: LayerElement = {
			id: "existing-image",
			type: ElementTypeEnum.Image,
			activeContentId: "existing-content",
			mainContentId: "existing-content",
			contents: [
				{
					contentId: "existing-content",
					src: "./images/existing.png",
					assetId: "asset-image",
				},
			],
		}
		const harness = createHarness({ elements: [existingImage] })
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		const result = await manager.importAndConnect({
			assetId: "asset-image",
			targetElementId: "video-target",
			slot: { kind: "reference" },
			allowedMediaTypes: ["image"],
		})

		expect(result.source).toBe("existing-binding")
		expect(result.elementId).not.toBe("existing-image")
		expect(harness.connect).toHaveBeenCalledWith({
			sourceElementId: result.elementId,
			targetElementId: "video-target",
		})
	})

	it("downloads, uploads, and connects a missing asset once for concurrent target imports", async () => {
		const harness = createHarness()
		const fetchMock = vi.fn(
			async () => new Response(new Blob(["audio"], { type: "audio/mpeg" }), { status: 200 }),
		)
		vi.stubGlobal("fetch", fetchMock)
		const manager = new CanvasAssetImportManager(harness.canvas as never)
		const request = {
			assetId: "asset-audio",
			targetElementId: "video-target",
			slot: { kind: "reference" } as const,
			allowedMediaTypes: ["audio"] as const,
		}

		const [first, second] = await Promise.all([
			manager.importAndConnect(request),
			manager.importAndConnect(request),
		])

		expect(first.source).toBe("downloaded")
		expect(second.source).toBe("existing-connection")
		expect(first.elementId).toBe(second.elementId)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(harness.uploadDirect).toHaveBeenCalledTimes(1)
		expect(harness.connect).toHaveBeenCalledTimes(1)
		expect(harness.uploadDirect).toHaveBeenCalledWith(expect.any(Array), undefined, undefined, {
			uploadSubDir: UploadSubDir.Audios,
		})
		expect(harness.canvas.audioResourceManager.primeCache).toHaveBeenCalledWith(
			harness.uploadResult.path,
			harness.uploadResult,
		)
	})

	it("rejects disallowed asset media before downloading or creating an element", async () => {
		const harness = createHarness({
			asset: {
				assetId: "asset-video",
				mediaType: "video",
				fileUrl: "https://example.test/source.mp4",
			},
		})
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		await expect(
			manager.importAndConnect({
				assetId: "asset-video",
				targetElementId: "video-target",
				slot: { kind: "frame" },
				allowedMediaTypes: ["image"],
			}),
		).rejects.toThrow("not allowed")

		expect(fetchMock).not.toHaveBeenCalled()
		expect(harness.uploadDirect).not.toHaveBeenCalled()
		expect(harness.canvas.elementManager.create).not.toHaveBeenCalled()
	})

	it.each([
		["download", () => Promise.resolve(new Response(null, { status: 403 }))],
		[
			"upload",
			() => Promise.resolve(new Response(new Blob(["audio"], { type: "audio/mpeg" }))),
		],
	] as const)("does not create a Canvas element when %s fails", async (stage, fetchResponse) => {
		const harness = createHarness()
		vi.stubGlobal("fetch", vi.fn(fetchResponse))
		if (stage === "upload") {
			harness.uploadDirect.mockRejectedValueOnce(new Error("upload failed"))
		}
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		await expect(
			manager.importAndConnect({
				assetId: "asset-audio",
				targetElementId: "video-target",
				slot: { kind: "reference" },
				allowedMediaTypes: ["audio"],
			}),
		).rejects.toThrow()

		expect(harness.canvas.elementManager.create).not.toHaveBeenCalled()
		expect(harness.connect).not.toHaveBeenCalled()
		expect(harness.register).not.toHaveBeenCalled()
	})

	it("does not create an element when the target disappears after upload", async () => {
		const harness = createHarness()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(new Blob(["audio"], { type: "audio/mpeg" }), { status: 200 }),
			),
		)
		let resolveUpload: ((value: (typeof harness.uploadResult)[]) => void) | undefined
		harness.uploadDirect.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveUpload = resolve
				}),
		)
		const manager = new CanvasAssetImportManager(harness.canvas as never)
		const importPromise = manager.importAndConnect({
			assetId: "asset-audio",
			targetElementId: "video-target",
			slot: { kind: "reference" },
			allowedMediaTypes: ["audio"],
		})
		await vi.waitFor(() => expect(resolveUpload).toBeTypeOf("function"))
		harness.elements.delete("video-target")
		resolveUpload?.([harness.uploadResult])

		await expect(importPromise).rejects.toThrow("target video is unavailable")
		expect(harness.canvas.elementManager.create).not.toHaveBeenCalled()
		expect(harness.connect).not.toHaveBeenCalled()
	})

	it("rolls back the media element when the connection cannot be created", async () => {
		const existingImage: LayerElement = {
			id: "existing-image",
			type: ElementTypeEnum.Image,
			activeContentId: "content",
			mainContentId: "content",
			contents: [
				{ contentId: "content", src: "./images/existing.png", assetId: "asset-image" },
			],
		}
		const harness = createHarness({
			elements: [existingImage],
			connect: vi.fn(() => ({
				status: "invalid" as const,
				reason: "missing-element" as const,
			})),
		})
		const manager = new CanvasAssetImportManager(harness.canvas as never)

		await expect(
			manager.importAndConnect({
				assetId: "asset-image",
				targetElementId: "video-target",
				slot: { kind: "frame" },
				allowedMediaTypes: ["image"],
			}),
		).rejects.toThrow("Failed to create")

		expect(harness.canvas.elementManager.delete).toHaveBeenCalledTimes(1)
		expect([...harness.elements.values()].filter((item) => item.id !== "video-target")).toEqual(
			[existingImage],
		)
		expect(harness.register).not.toHaveBeenCalled()
	})
})
