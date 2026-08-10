import { afterEach, describe, expect, it, vi } from "vitest"
import type { ImageModelItem } from "../../../../public/magic-types"
import type { Canvas } from "../../../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import {
	canCreateStoryboardFromConnection,
	createStoryboardFromImageConnection,
	resolveStoryboardConnectionGenerationConfig,
} from "../storyboardConnectionCreation"

function createImageModel(): ImageModelItem {
	return {
		id: "model-1",
		group_id: "group-1",
		model_id: "gpt-image-2",
		model_name: "GPT Image 2",
		provider_model_id: "gpt-image-2",
		model_description: "",
		model_icon: "",
		model_status: "normal",
		sort: 1,
		image_size_config: {
			default_scale: "1K",
			sizes: [{ label: "9:16", value: "1080x1920", scale: "1K" }],
			image_settings: [
				{
					key: "image_generation_config.quality",
					label: "Quality",
					description: "",
					component: "single_select",
					variant: "segmented",
					default: "high",
					options: [{ label: "High", value: "high" }],
				},
			],
		},
	}
}

function createCanvasMock(options?: {
	originType?: LayerElement["type"]
	originChildren?: LayerElement[]
	connectionStatus?: "created" | "invalid"
	storedConfig?: Record<string, unknown>
}) {
	const originType = options?.originType ?? ElementTypeEnum.Image
	const originElement = {
		id: "image-1",
		type: originType,
		contents: [{ contentId: "image-1-content" }],
		activeContentId: "image-1-content",
		mainContentId: "image-1-content",
		...(originType === ElementTypeEnum.Frame
			? { children: options?.originChildren ?? [] }
			: {}),
	} as LayerElement
	const elements = new Map<string, LayerElement>([[originElement.id, originElement]])
	const create = vi.fn((element: LayerElement) => elements.set(element.id, element))
	const remove = vi.fn((elementId: string) => elements.delete(elementId))
	const connectElements = vi.fn(() =>
		options?.connectionStatus === "invalid"
			? ({ status: "invalid", reason: "missing-element" } as const)
			: ({ status: "created", connectionId: "connection-1" } as const),
	)
	const select = vi.fn()
	const moveElementToViewport = vi.fn()
	const canvas = {
		elementManager: {
			getElementData: vi.fn((elementId: string) => elements.get(elementId)),
			getNextZIndexInLevel: vi.fn(() => 7),
			create,
			delete: remove,
			hasElement: vi.fn((elementId: string) => elements.has(elementId)),
		},
		connectionManager: { connectElements },
		selectionManager: { select },
		viewportController: {
			isElementInViewport: vi.fn(() => false),
			moveElementToViewport,
		},
		magicConfigManager: {
			config: {
				methods: {
					getRootStorage: vi.fn(() => ({
						defaultGenerateImageConfig: options?.storedConfig,
					})),
				},
			},
		},
	} as unknown as Canvas

	return { canvas, create, remove, connectElements, select, moveElementToViewport }
}

describe("storyboard connection creation", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("is available from the right handle of an image or usable Frame", () => {
		const { canvas } = createCanvasMock()

		expect(
			canCreateStoryboardFromConnection(canvas, {
				originElementId: "image-1",
				originSide: "right",
			}),
		).toBe(true)
		expect(
			canCreateStoryboardFromConnection(canvas, {
				originElementId: "image-1",
				originSide: "left",
			}),
		).toBe(false)
		expect(
			canCreateStoryboardFromConnection(createCanvasMock({ originType: "video" }).canvas, {
				originElementId: "image-1",
				originSide: "right",
			}),
		).toBe(false)
		expect(
			canCreateStoryboardFromConnection(
				createCanvasMock({
					originType: ElementTypeEnum.Frame,
					originChildren: [
						{
							id: "frame-image",
							type: ElementTypeEnum.Image,
							visible: true,
							contents: [{ contentId: "frame-image-content" }],
							activeContentId: "frame-image-content",
							mainContentId: "frame-image-content",
						} as LayerElement,
					],
				}).canvas,
				{ originElementId: "image-1", originSide: "right" },
			),
		).toBe(true)
		expect(
			canCreateStoryboardFromConnection(
				createCanvasMock({ originType: ElementTypeEnum.Frame }).canvas,
				{ originElementId: "image-1", originSide: "right" },
			),
		).toBe(false)
	})

	it("uses the stored image generation config without sharing nested state", () => {
		const storedConfig = {
			model_id: "stored-model",
			size: "1024x1024",
			resolution: "2K",
			image_generation_config: { quality: "medium" },
		}
		const { canvas } = createCanvasMock({ storedConfig })

		const result = resolveStoryboardConnectionGenerationConfig(canvas, [createImageModel()])

		expect(result).toEqual(storedConfig)
		expect(result).not.toBe(storedConfig)
		expect(result?.image_generation_config).not.toBe(storedConfig.image_generation_config)
	})

	it("falls back to the first image model defaults", () => {
		const { canvas } = createCanvasMock()

		expect(resolveStoryboardConnectionGenerationConfig(canvas, [createImageModel()])).toEqual({
			model_id: "gpt-image-2",
			size: "1080x1920",
			resolution: "1K",
			image_generation_config: { quality: "high" },
		})
	})

	it("creates, connects, selects and focuses the storyboard", () => {
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0)
			return 1
		})
		const { canvas, create, connectElements, select, moveElementToViewport } =
			createCanvasMock()

		const elementId = createStoryboardFromImageConnection(canvas, {
			originElementId: "image-1",
			originSide: "right",
			x: 1200,
			y: 300,
			imageModelList: [createImageModel()],
		})

		expect(elementId).toMatch(/^element-/)
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: elementId,
				type: ElementTypeEnum.Storyboard,
				x: 1200,
				y: 300,
				zIndex: 7,
				contents: [
					expect.objectContaining({
						shots: [expect.objectContaining({ durationSeconds: 3 })],
					}),
				],
			}),
		)
		expect(connectElements).toHaveBeenCalledWith({
			sourceElementId: "image-1",
			targetElementId: elementId,
		})
		expect(select).toHaveBeenCalledWith(elementId)
		expect(moveElementToViewport).toHaveBeenCalledWith([elementId], {
			animated: true,
			padding: { top: 50, right: 50, bottom: 50, left: 100 },
		})
	})

	it("removes the new element when the connection cannot be persisted", () => {
		const { canvas, remove, select } = createCanvasMock({ connectionStatus: "invalid" })

		const result = createStoryboardFromImageConnection(canvas, {
			originElementId: "image-1",
			originSide: "right",
			x: 1200,
			y: 300,
			imageModelList: [createImageModel()],
		})

		expect(result).toBeNull()
		expect(remove).toHaveBeenCalledWith(expect.stringMatching(/^element-/))
		expect(select).not.toHaveBeenCalled()
	})
})
