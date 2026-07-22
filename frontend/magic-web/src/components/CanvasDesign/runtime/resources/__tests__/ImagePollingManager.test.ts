import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type ImageElement } from "../../document/types"
import { GenerationStatus } from "../../../public/magic-types"
import { ImagePollingManager } from "../polling/ImagePollingManager"

function createImageElement(overrides?: Partial<ImageElement>): ImageElement {
	return {
		id: "image-element-1",
		type: ElementTypeEnum.Image,
		x: 0,
		y: 0,
		width: 512,
		height: 512,
		zIndex: 1,
		generateImageRequest: {
			image_id: "image-task-1",
			model_id: "model-1",
			prompt: "pikachu",
		},
		...overrides,
	}
}

describe("ImagePollingManager", () => {
	it("primes generated image metadata and leaves loading to visibility scheduling", async () => {
		const element = createImageElement()
		const getImageGenerationResult = vi.fn().mockResolvedValue({
			image_id: "image-task-1",
			status: GenerationStatus.Completed,
			file_dir: "/images/",
			file_name: "generated.png",
			file_url: "https://example.test/generated.png",
			error_message: null,
		})
		const update = vi.fn((elementId: string, updates: Partial<ImageElement>) => {
			if (elementId === element.id) {
				Object.assign(element, updates)
			}
		})
		const primeCache = vi.fn()
		const loadResource = vi.fn()
		const emit = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResult,
					},
				},
			},
			elementManager: {
				update,
			},
			imageResourceManager: {
				primeCache,
				loadResource,
			},
			eventEmitter: {
				emit,
			},
		}

		const manager = new ImagePollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})

		manager.start()

		await vi.waitFor(() => {
			expect(update).toHaveBeenCalled()
		})

		expect(primeCache).toHaveBeenCalledWith("images/generated.png", {
			src: "https://example.test/generated.png",
			fileName: "generated.png",
			resource_version: "generated:generated.png",
		})
		expect(loadResource).not.toHaveBeenCalled()
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:resultUpdated",
			data: { elementId: element.id },
		})
	})
})
