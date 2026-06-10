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

vi.mock("../../../canvas/utils/elementUtils", () => ({
	withHistoryManagerAsync: async (
		_historyManager: unknown,
		callback: () => Promise<unknown>,
	) => callback(),
}))

vi.mock("../../../canvas/utils/ImageBatchPollingManager", () => ({
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
	const update = vi.fn()
	const emit = vi.fn()
	const select = vi.fn()
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
			}),
		},
		elementManager: {
			update,
		},
		selectionManager: {
			select,
		},
		eventEmitter: {
			emit,
		},
		imageBatchPollingRegistry,
		__spies: {
			createImageElementsNearViewport,
			update,
			select,
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

		expect(canvas.__spies.createImageElementsNearViewport).toHaveBeenCalledWith(3, 1024, 1024)
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
			}),
			{ silent: false },
		)
		expect(canvas.__spies.update).toHaveBeenCalledWith(
			"element-2",
			expect.objectContaining({
				generateImageRequest: expect.not.objectContaining({
					image_id: expect.any(String),
				}),
			}),
			{ silent: false },
		)
		expect(batchImageId).toBeTruthy()
	})
})
