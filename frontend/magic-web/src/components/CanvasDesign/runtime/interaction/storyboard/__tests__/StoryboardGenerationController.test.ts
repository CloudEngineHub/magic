import { afterEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "../../../core/EventEmitter"
import {
	ElementTypeEnum,
	type ImageElement as ImageElementData,
	type StoryboardElement,
} from "../../../document/types"
import { ImageElement } from "../../../elements/image/ImageElement"
import type { ImageModelItem } from "../../../../public/magic-types"
import { StoryboardGenerationController } from "../StoryboardGenerationController"

function createStoryboard(): StoryboardElement {
	return {
		id: "storyboard-1",
		type: ElementTypeEnum.Storyboard,
		x: 100,
		y: 200,
		width: 960,
		height: 1360,
		shots: [
			{ id: "shot-1", durationSeconds: 3, description: "wide shot" },
			{ id: "shot-2", durationSeconds: 4, description: "close up" },
		],
		generationConfig: {
			model_id: "model-1",
			size: "1024x1024",
			resolution: "1K",
			image_generation_config: { quality: "high" },
		},
	}
}

function createModel(maxReferenceImages = 4): ImageModelItem {
	return {
		id: "model-1",
		group_id: "official",
		model_id: "model-1",
		model_name: "测试模型",
		provider_model_id: "provider-model-1",
		model_description: "",
		model_icon: "",
		model_status: "normal",
		sort: 1,
		image_size_config: {
			default_scale: "1K",
			max_reference_images: maxReferenceImages,
			sizes: [{ label: "1:1", value: "1024x1024", scale: "1K" }],
		},
	} as ImageModelItem
}

function createHarness(options?: {
	storyboard?: StoryboardElement
	model?: ImageModelItem
	inputImage?: ImageElementData
	failInitialSubmissionIndex?: number
}) {
	const elements = new Map<string, any>()
	const instances = new Map<string, ImageElement>()
	const parents = new Map<string, string>()
	const submissions: Array<{
		elementId: string
		kind: "initial" | "version"
		request: Record<string, unknown>
	}> = []
	const connections: Array<{
		sourceElementId: string
		targetElementId: string
		locked?: boolean
	}> = []
	const eventEmitter = new EventEmitter()
	let zIndex = 10
	let initialSubmissionCount = 0

	const registerImage = (data: ImageElementData) => {
		elements.set(data.id, data)
		const instance = Object.create(ImageElement.prototype) as ImageElement & {
			getData: () => ImageElementData
			hasGenerationHistory: () => boolean
			getLatestVersionData: () => any
			generateImage: (request: Record<string, unknown>) => Promise<boolean>
			generateImageVersion: (
				request: Record<string, unknown>,
				options?: Record<string, unknown>,
			) => Promise<boolean>
		}
		instance.getData = () => elements.get(data.id) as ImageElementData
		instance.hasGenerationHistory = vi.fn(() => {
			const current = elements.get(data.id) as ImageElementData
			return Boolean(current.generateImageRequest) || current.imageDslVersion === 2
		})
		instance.getLatestVersionData = vi.fn(() => {
			const current = elements.get(data.id) as ImageElementData
			return current.imageDslVersion === 2 ? (current.versions.at(-1) ?? current) : current
		})
		instance.generateImage = vi.fn(async (request) => {
			const submissionIndex = initialSubmissionCount++
			if (options?.failInitialSubmissionIndex === submissionIndex) {
				throw new Error("submit failed")
			}
			submissions.push({ elementId: data.id, kind: "initial", request })
			elements.set(data.id, {
				...elements.get(data.id),
				generateImageRequest: request,
			})
			return true
		})
		instance.generateImageVersion = vi.fn(async (request) => {
			submissions.push({ elementId: data.id, kind: "version", request })
			return true
		})
		instances.set(data.id, instance)
	}

	const register = (data: any, parentId?: string) => {
		elements.set(data.id, data)
		if (parentId) parents.set(data.id, parentId)
		if (data.type === ElementTypeEnum.Image) registerImage(data)
		if (data.type === ElementTypeEnum.Frame && Array.isArray(data.children)) {
			data.children.forEach((child: any) => register(child, data.id))
		}
	}

	const storyboard = options?.storyboard ?? createStoryboard()
	register(storyboard)
	if (options?.inputImage) {
		registerImage(options.inputImage)
	}

	const frameCount = () =>
		Array.from(elements.values()).filter((element) => element.type === ElementTypeEnum.Frame)
			.length

	const canvas = {
		eventEmitter,
		contentLayer: { batchDraw: vi.fn() },
		t: (_key: string, fallback: string) => fallback,
		historyManager: {
			disable: vi.fn(),
			enable: vi.fn(),
			recordHistoryImmediate: vi.fn(),
		},
		magicConfigManager: {
			config: {
				methods: {
					resolveResourceReference: undefined,
					generateImage: vi.fn(),
				},
			},
		},
		generationRuntimeManager: { getTargetState: vi.fn(() => null) },
		elementManager: {
			getElementData: vi.fn((id: string) => elements.get(id)),
			getElementInstance: vi.fn((id: string) => instances.get(id)),
			getAllElementIds: vi.fn(() => Array.from(elements.keys())),
			hasElement: vi.fn((id: string) => elements.has(id)),
			getNextZIndexInLevel: vi.fn(() => ++zIndex),
			create: vi.fn((data: any) => register(data)),
			update: vi.fn((id: string, patch: Record<string, unknown>) => {
				const current = elements.get(id)
				if (!current) return
				elements.set(id, { ...current, ...patch })
				if (id === storyboard.id) {
					Object.assign(storyboard, patch)
				}
			}),
			reparentElements: vi.fn((options: any) => {
				const frame = elements.get(options.targetParentId)
				const item = options.elements[0]
				if (!frame || !item) return false
				parents.set(item.elementId, frame.id)
				frame.children = [
					...(frame.children ?? []).filter((child: any) => child.id !== item.elementId),
					{ ...elements.get(item.elementId) },
				]
				elements.set(frame.id, frame)
				return true
			}),
			delete: vi.fn((id: string) => {
				elements.delete(id)
				instances.delete(id)
				parents.delete(id)
			}),
			findParentIdForElement: vi.fn((id: string) => parents.get(id)),
		},
		connectionManager: {
			getUpstreamConnections: vi.fn((id: string) =>
				id === storyboard.id && options?.inputImage
					? [{ sourceElementId: options.inputImage.id, targetElementId: id }]
					: [],
			),
			getDownstreamConnections: vi.fn((id: string) =>
				connections.filter((connection) => connection.sourceElementId === id),
			),
			ensureLockedConnection: vi.fn((sourceElementId: string, targetElementId: string) => {
				if (
					!connections.some(
						(connection) =>
							connection.sourceElementId === sourceElementId &&
							connection.targetElementId === targetElementId,
					)
				) {
					connections.push({ sourceElementId, targetElementId, locked: true })
				}
			}),
		},
	} as any

	return {
		canvas,
		storyboard,
		elements,
		parents,
		instances,
		submissions,
		connections,
		frameCount,
		model: options?.model ?? createModel(),
	}
}

describe("StoryboardGenerationController", () => {
	afterEach(() => vi.restoreAllMocks())

	it("creates one frame, one locked output per shot, and submits all requests concurrently", async () => {
		const harness = createHarness()
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)

		expect(harness.frameCount()).toBe(1)
		const outputFrame = Array.from(harness.elements.values()).find(
			(element) => element.type === ElementTypeEnum.Frame,
		)
		expect(outputFrame?.x).toBe(100 + 960 + 1024)
		expect(outputFrame?.y).toBe(200 + 1360 / 2 - (outputFrame?.height ?? 0) / 2)
		expect(harness.submissions).toHaveLength(2)
		expect(harness.submissions.map((item) => item.kind)).toEqual(["initial", "initial"])
		expect(harness.connections).toHaveLength(2)
		expect(harness.connections.every((connection) => connection.locked)).toBe(true)
		expect(harness.storyboard.shots?.map((shot) => shot.outputImageElementId)).toEqual(
			expect.arrayContaining([expect.any(String), expect.any(String)]),
		)
		expect(
			new Set(harness.storyboard.shots?.map((shot) => shot.outputImageElementId)).size,
		).toBe(2)
		controller.destroy()
	})

	it("blocks the whole batch for an empty shot description", async () => {
		const storyboard = createStoryboard()
		storyboard.shots![1].description = "   "
		const harness = createHarness({ storyboard })
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)

		expect(harness.submissions).toEqual([])
		expect(harness.frameCount()).toBe(0)
		controller.destroy()
	})

	it("blocks the whole batch when references exceed the model limit", async () => {
		const inputImage: ImageElementData = {
			id: "reference-image",
			type: ElementTypeEnum.Image,
			x: 0,
			y: 0,
			width: 512,
			height: 512,
			src: "./images/reference.png",
		}
		const harness = createHarness({ inputImage, model: createModel(0) })
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)

		expect(harness.submissions).toEqual([])
		expect(harness.frameCount()).toBe(0)
		controller.destroy()
	})

	it("reuses stable output elements and appends versions on subsequent batches", async () => {
		const harness = createHarness()
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)
		const outputIds = harness.storyboard.shots?.map((shot) => shot.outputImageElementId)
		await controller.generateAll(harness.storyboard.id)

		expect(harness.frameCount()).toBe(1)
		expect(harness.storyboard.shots?.map((shot) => shot.outputImageElementId)).toEqual(
			outputIds,
		)
		expect(harness.submissions.map((item) => item.kind)).toEqual([
			"initial",
			"initial",
			"version",
			"version",
		])
		controller.destroy()
	})

	it("reparents a missing output back into the existing frame", async () => {
		const harness = createHarness()
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)
		const missingId = harness.storyboard.shots?.[1]?.outputImageElementId
		const existingId = harness.storyboard.shots?.[0]?.outputImageElementId
		const frameId = existingId ? harness.parents.get(existingId) : undefined
		if (!missingId || !existingId || !frameId)
			throw new Error("Expected generated frame outputs")
		harness.elements.delete(missingId)
		harness.instances.delete(missingId)
		harness.parents.delete(missingId)
		const frame = harness.elements.get(frameId)
		frame.children = frame.children?.filter((child: { id: string }) => child.id !== missingId)

		await controller.generateAll(harness.storyboard.id)

		const restoredId = harness.storyboard.shots?.[1]?.outputImageElementId
		expect(restoredId).toBeTruthy()
		expect(restoredId).not.toBe(missingId)
		expect(harness.parents.get(restoredId as string)).toBe(frameId)
		expect(harness.elements.get(frameId).children).toHaveLength(2)
		expect(harness.frameCount()).toBe(1)
		controller.destroy()
	})

	it("shares the associated image version and crop options across every shot", async () => {
		const inputImage: ImageElementData = {
			id: "reference-image",
			type: ElementTypeEnum.Image,
			x: 0,
			y: 0,
			width: 512,
			height: 512,
			imageDslVersion: 2,
			activeVersionId: "v2",
			mainVersionId: "v2",
			versions: [
				{
					id: "v1",
					src: "./images/associated.png",
					crop: { x: 1, y: 2, width: 100, height: 80 },
				},
				{
					id: "v2",
					src: "./images/reference.png",
					crop: { x: 10, y: 20, width: 300, height: 200 },
				},
			],
		}
		const harness = createHarness({ inputImage })
		const getAssociatedVersionData = vi.fn(() => inputImage.versions[0])
		const inputInstance = harness.instances.get(inputImage.id)
		if (!inputInstance) throw new Error("Expected input image instance")
		inputInstance.getAssociatedVersionData = getAssociatedVersionData
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)

		expect(harness.submissions[0]?.request).toEqual(
			expect.objectContaining({
				reference_images: ["./images/associated.png"],
				reference_image_options: [
					{
						path: "./images/associated.png",
						crop: { x: 1, y: 2, width: 100, height: 80 },
					},
				],
			}),
		)
		expect(harness.submissions[1]?.request).toEqual(
			expect.objectContaining({
				reference_images: ["./images/associated.png"],
				reference_image_options: [
					{
						path: "./images/associated.png",
						crop: { x: 1, y: 2, width: 100, height: 80 },
					},
				],
			}),
		)
		expect(getAssociatedVersionData).toHaveBeenCalled()
		controller.destroy()
	})

	it("keeps the output structure when one submission fails", async () => {
		const storyboard = createStoryboard()
		const harness = createHarness({ storyboard, failInitialSubmissionIndex: 1 })
		const controller = new StoryboardGenerationController(harness.canvas, async () => [
			harness.model,
		])

		await controller.generateAll(harness.storyboard.id)
		expect(harness.frameCount()).toBe(1)
		expect(harness.storyboard.shots?.every((shot) => shot.outputImageElementId)).toBe(true)
		controller.destroy()
	})
})
