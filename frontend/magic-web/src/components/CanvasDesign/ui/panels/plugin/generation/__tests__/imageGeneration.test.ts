import { describe, expect, it, vi } from "vitest"

const { start, generateImages, ImageBatchPollingManagerMock } = vi.hoisted(() => {
	const start = vi.fn()
	const generateImages = vi.fn()
	const ImageBatchPollingManagerMock = vi.fn().mockImplementation(() => ({
		start,
	}))

	return {
		start,
		generateImages,
		ImageBatchPollingManagerMock,
	}
})

vi.mock("../../../../../runtime/shared/placement/elementUtils", () => ({
	withHistoryManagerAsync: async (_historyManager: unknown, callback: () => Promise<unknown>) =>
		callback(),
	// 固定视口与中心点，保证落点算法在单测里输出稳定坐标。
	getCanvasCenter: () => ({ x: 1500, y: 1000 }),
	getResolvedMediaPlacementConfig: () => ({
		spacing: 200,
		maxPerRow: 6,
		maxSearchRings: 4,
	}),
	getViewportCanvasRect: () => ({
		x: 0,
		y: 0,
		width: 3200,
		height: 2200,
	}),
}))

vi.mock("../../../../../runtime/resources/polling/ImageBatchPollingManager", () => ({
	ImageBatchPollingManager: ImageBatchPollingManagerMock,
}))

import { generatePluginImages } from "../imageGeneration"

function createCanvas({
	maxOutputImages = 4,
	modelId = "model-a",
}: {
	maxOutputImages?: number
	modelId?: string
} = {}) {
	const createImageElementsNearViewport = vi.fn((count: number) =>
		Array.from({ length: count }, (_, index) => `element-${index + 1}`),
	)
	// 新落点链路会先算 positions，再按左上角坐标批量创建占位图。
	const createImageElementsAtPositions = vi.fn((positions: Array<{ x: number; y: number }>) =>
		positions.map((_, index) => `element-${index + 1}`),
	)
	const resolveImageElementSize = vi.fn((width?: number, height?: number) => ({
		width: width ?? 1024,
		height: height ?? 1024,
	}))
	const update = vi.fn()
	const emit = vi.fn()
	const select = vi.fn()
	const focusOnElements = vi.fn()
	const imageBatchPollingRegistry = {
		track: vi.fn(),
		untrack: vi.fn(),
		destroy: vi.fn(),
	}

	return {
		readonly: false,
		historyManager: null,
		magicConfigManager: {
			config: {
				methods: {
					generateImage: vi.fn(),
					generateImages,
					getImageGenerationResults: vi.fn(),
					getImageModelList: vi.fn().mockResolvedValue([
						{
							model_id: modelId,
							model_name: "Model A",
							model_icon: "",
							model_description: "",
							image_size_config: {
								max_output_images: maxOutputImages,
								max_reference_images: 3,
								sizes: [{ label: "1:1", value: "1024x1024", scale: "1K" }],
							},
						},
					]),
				},
			},
		},
		toolManager: {
			getImageGeneratorTool: () => ({
				createImageElementsNearViewport,
				createImageElementsAtPositions,
				resolveImageElementSize,
			}),
		},
		elementManager: {
			getAllElements: vi.fn(() => []),
			getElementData: vi.fn(() => undefined),
			update,
		},
		permissionManager: {
			isVisible: vi.fn((element) => element.visible !== false),
		},
		selectionManager: {
			select,
			getSelectedIds: vi.fn(() => []),
		},
		viewportController: {
			focusOnElements,
		},
		eventEmitter: {
			emit,
		},
		imageBatchPollingRegistry,
		__spies: {
			createImageElementsNearViewport,
			createImageElementsAtPositions,
			resolveImageElementSize,
			update,
			select,
			focusOnElements,
			emit,
			imageBatchPollingRegistry,
		},
	}
}

describe("imageGeneration", () => {
	it("creates one batch task, then fills placeholders from multi-image results", async () => {
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()

		generateImages.mockResolvedValue({
			project_id: "project-1",
			image_id: "batch-1",
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			resolution: "1K",
			file_dir: "/images/",
			generate_num: 3,
			status: "processing",
			error_message: null,
			images: [],
		})

		const result = await generatePluginImages(canvas as never, {
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			count: 3,
			select: true,
		})

		expect(canvas.__spies.resolveImageElementSize).toHaveBeenCalledWith(1024, 1024)
		expect(canvas.__spies.createImageElementsAtPositions).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
			]),
			1024,
			1024,
		)
		expect(generateImages).toHaveBeenCalledTimes(1)
		expect(generateImages).toHaveBeenCalledWith(
			expect.objectContaining({
				model_id: "model-a",
				prompt: "Generate",
				size: "1024x1024",
				generate_num: 3,
			}),
		)
		const batchImageId = generateImages.mock.calls[0]?.[0]?.image_id
		expect(ImageBatchPollingManagerMock).toHaveBeenCalledWith({
			canvas,
			imageId: batchImageId,
			elementIds: ["element-1", "element-2", "element-3"],
			registry: canvas.imageBatchPollingRegistry,
		})
		expect(start).toHaveBeenCalledWith()
		expect(canvas.__spies.select).toHaveBeenCalledWith("element-3")
		expect(result).toEqual({ elementIds: ["element-1", "element-2", "element-3"] })
		expect(start).toHaveBeenCalledTimes(1)
		expect(canvas.__spies.update).toHaveBeenCalledWith(
			"element-1",
			expect.objectContaining({
				status: "processing",
				generateImageRequest: expect.objectContaining({
					model_id: "model-a",
					prompt: "Generate",
					size: "1024x1024",
				}),
				imageGenerationTaskMeta: {
					type: "batch",
					image_id: batchImageId,
					output_index: 1,
					output_count: 3,
				},
			}),
			{ silent: false },
		)
		expect(canvas.__spies.update).toHaveBeenCalledWith(
			"element-2",
			expect.objectContaining({
				generateImageRequest: expect.not.objectContaining({
					image_id: expect.any(String),
				}),
				imageGenerationTaskMeta: expect.objectContaining({
					type: "batch",
					image_id: batchImageId,
					output_index: 2,
					output_count: 3,
				}),
			}),
			{ silent: false },
		)
		expect(batchImageId).toBeTruthy()
	})

	it("places plugin results to the right of the matched reference image", async () => {
		// 来源映射命中时，生成结果应优先贴在来源图右侧。
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
		canvas.elementManager.getAllElements.mockReturnValue([
			{
				id: "source-image",
				type: "image",
				src: "./images/source.png",
				x: 100,
				y: 120,
				width: 400,
				height: 300,
				visible: true,
			},
		])
		canvas.elementManager.getElementData.mockImplementation((elementId: string) =>
			elementId === "source-image" ? canvas.elementManager.getAllElements()[0] : undefined,
		)
		generateImages.mockResolvedValue({ image_id: "batch-1" })

		await generatePluginImages(
			canvas as never,
			{
				model_id: "model-a",
				prompt: "Generate",
				size: "1024x1024",
				count: 1,
				reference_images: ["./images/source.png"],
			},
			{
				sourceElementByAssetKey: new Map([["./images/source.png", "source-image"]]),
			},
		)

		expect(canvas.__spies.createImageElementsAtPositions).toHaveBeenCalledWith(
			[{ x: 700, y: 120 }],
			1024,
			1024,
		)
		expect(canvas.__spies.select).toHaveBeenCalledWith("element-1")
	})

	it("falls back to the selected source image when reference keys are not mapped", async () => {
		// 插件没有传回可匹配 key 时，当前选中的非生成图片作为来源图兜底。
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
		canvas.elementManager.getAllElements.mockReturnValue([
			{
				id: "source-image",
				type: "image",
				src: "./images/source.png",
				x: 100,
				y: 120,
				width: 400,
				height: 300,
				visible: true,
			},
		])
		canvas.elementManager.getElementData.mockImplementation((elementId: string) =>
			elementId === "source-image" ? canvas.elementManager.getAllElements()[0] : undefined,
		)
		canvas.selectionManager.getSelectedIds.mockReturnValue(["source-image"])
		generateImages.mockResolvedValue({ image_id: "batch-1" })

		await generatePluginImages(canvas as never, {
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			count: 1,
			reference_image_options: [{ path: "./images/unmapped-source.png" }],
		})

		expect(canvas.__spies.createImageElementsAtPositions).toHaveBeenCalledWith(
			[{ x: 700, y: 120 }],
			1024,
			1024,
		)
	})

	it("does not use a selected generated image as the source fallback", async () => {
		// 选中的生成产物不能作为下一次来源，否则结果会一代一代偏移。
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
		canvas.elementManager.getAllElements.mockReturnValue([
			{
				id: "generated-output",
				type: "image",
				src: "./images/generated.png",
				x: 100,
				y: 120,
				width: 400,
				height: 300,
				visible: true,
				generateImageRequest: { model_id: "model-a", prompt: "previous" },
			},
		])
		canvas.elementManager.getElementData.mockImplementation((elementId: string) =>
			elementId === "generated-output"
				? canvas.elementManager.getAllElements()[0]
				: undefined,
		)
		canvas.selectionManager.getSelectedIds.mockReturnValue(["generated-output"])
		generateImages.mockResolvedValue({ image_id: "batch-1" })

		await generatePluginImages(canvas as never, {
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			count: 1,
			reference_image_options: [{ path: "./images/unmapped-source.png" }],
		})

		expect(canvas.__spies.createImageElementsAtPositions).toHaveBeenCalledWith(
			[{ x: 988, y: 488 }],
			1024,
			1024,
		)
	})

	it("continues the existing generated grid when the reference image is not on canvas", async () => {
		// 外部引用图不在画布上时，同参数再次生成要接在已有输出网格之后。
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
		const previousRequest = {
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			reference_image_options: [{ path: "./images/external-source.png" }],
		}
		canvas.elementManager.getAllElements.mockReturnValue([
			{
				id: "generated-output-1",
				type: "image",
				x: 100,
				y: 120,
				width: 1024,
				height: 1024,
				visible: true,
				generateImageRequest: previousRequest,
			},
			{
				id: "generated-output-2",
				type: "image",
				x: 1324,
				y: 120,
				width: 1024,
				height: 1024,
				visible: true,
				generateImageRequest: previousRequest,
			},
		])
		generateImages.mockResolvedValue({ image_id: "batch-1" })

		await generatePluginImages(canvas as never, {
			model_id: "model-a",
			prompt: "Generate",
			size: "1024x1024",
			count: 1,
			reference_image_options: [{ path: "images/external-source.png" }],
		})

		expect(canvas.__spies.createImageElementsAtPositions).toHaveBeenCalledWith(
			[{ x: 2548, y: 120 }],
			1024,
			1024,
		)
	})

	it("selects the last generated element even when plugin disables selection", async () => {
		// 插件生成结果始终选中最后一张；select=false 不再阻止宿主选中新结果。
		const canvas = createCanvas({ maxOutputImages: 4 })
		generateImages.mockReset()
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
		generateImages.mockResolvedValue({ image_id: "batch-1" })
		const originalRequestAnimationFrame = globalThis.requestAnimationFrame
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0)
			return 1
		}) as typeof requestAnimationFrame

		try {
			await generatePluginImages(canvas as never, {
				model_id: "model-a",
				prompt: "Generate",
				size: "1024x1024",
				count: 2,
				select: false,
			})
		} finally {
			globalThis.requestAnimationFrame = originalRequestAnimationFrame
		}

		expect(canvas.__spies.select).toHaveBeenCalledWith("element-2")
		expect(canvas.__spies.focusOnElements).toHaveBeenCalledWith(["element-1", "element-2"], {
			animated: true,
			panOnly: true,
			selectElement: ["element-2"],
			ensureFullyVisible: true,
		})
	})
})
