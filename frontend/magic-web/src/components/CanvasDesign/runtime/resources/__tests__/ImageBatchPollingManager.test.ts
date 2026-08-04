import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type ImageElement } from "../../document/types"
import { createBatchImageTaskMeta } from "../image/imageGenerationTaskMeta"
import { ImageBatchPollingManager } from "../polling/ImageBatchPollingManager"

function createBatchElement(
	elementId: string,
	outputIndex: number,
	imageId = "batch-1",
): ImageElement {
	return {
		id: elementId,
		type: ElementTypeEnum.Image,
		x: 0,
		y: 0,
		width: 512,
		height: 512,
		zIndex: outputIndex,
		status: "processing",
		imageGenerationTaskMeta: createBatchImageTaskMeta({
			imageId,
			outputIndex,
			outputCount: 2,
		}),
	}
}

describe("ImageBatchPollingManager", () => {
	it("stops polling when the last tracked element is deleted", async () => {
		let resolveResults: ((value: unknown) => void) | undefined
		const elementDeletedHandlers: Array<(event: { data: { elementId: string } }) => void> = []
		const batchDeletedHandlers: Array<(event: { data: { elementIds: string[] } }) => void> = []
		const getImageGenerationResults = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveResults = resolve
				}),
		)
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResults,
					},
				},
			},
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn(() => createBatchElement("element-1", 1)),
				update: vi.fn(),
				batchDelete: vi.fn(),
			},
			eventEmitter: {
				emit: vi.fn(),
				on: vi.fn((eventName: string, handler: never) => {
					if (eventName === "element:deleted") {
						elementDeletedHandlers.push(
							handler as (event: { data: { elementId: string } }) => void,
						)
					}
					if (eventName === "element:batchdeleted") {
						batchDeletedHandlers.push(
							handler as (event: { data: { elementIds: string[] } }) => void,
						)
					}
					return vi.fn()
				}),
			},
		}
		const registry = {
			track: vi.fn(),
			untrack: vi.fn(),
		}
		const manager = new ImageBatchPollingManager({
			canvas: canvas as never,
			imageId: "batch-1",
			elementIds: ["element-1"],
			registry: registry as never,
		})

		const startPromise = manager.start()
		await Promise.resolve()

		expect(elementDeletedHandlers).toHaveLength(1)
		expect(batchDeletedHandlers).toHaveLength(1)

		elementDeletedHandlers[0]({ data: { elementId: "element-1" } })

		expect(registry.untrack).toHaveBeenCalledWith(manager)

		resolveResults?.(null)
		await startPromise
	})

	it("untracks itself immediately when stopped before start cleanup finishes", async () => {
		let resolveResults: ((value: unknown) => void) | undefined
		const unsubscribeElementDeleted = vi.fn()
		const unsubscribeBatchDeleted = vi.fn()
		const getImageGenerationResults = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveResults = resolve
				}),
		)
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResults,
					},
				},
			},
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn(() => createBatchElement("element-1", 1)),
				update: vi.fn(),
				batchDelete: vi.fn(),
			},
			eventEmitter: {
				emit: vi.fn(),
				on: vi
					.fn()
					.mockReturnValueOnce(unsubscribeElementDeleted)
					.mockReturnValueOnce(unsubscribeBatchDeleted),
			},
		}
		const activeManagers = new Set<ImageBatchPollingManager>()
		const registry = {
			track: vi.fn((manager: ImageBatchPollingManager) => {
				activeManagers.add(manager)
			}),
			untrack: vi.fn((manager: ImageBatchPollingManager) => {
				activeManagers.delete(manager)
			}),
			get: vi.fn((imageId: string) => {
				return Array.from(activeManagers).find(
					(manager) => manager.getImageId() === imageId,
				)
			}),
		}
		const manager = new ImageBatchPollingManager({
			canvas: canvas as never,
			imageId: "batch-1",
			elementIds: ["element-1"],
			registry: registry as never,
		})

		const startPromise = manager.start()
		await Promise.resolve()

		expect(registry.get("batch-1")).toBe(manager)

		manager.stop()

		expect(registry.get("batch-1")).toBeUndefined()
		expect(unsubscribeElementDeleted).toHaveBeenCalledTimes(1)
		expect(unsubscribeBatchDeleted).toHaveBeenCalledTimes(1)

		resolveResults?.(null)
		await startPromise
	})

	it("maps generated result indexes to explicit element output indexes", async () => {
		const update = vi.fn()
		const emit = vi.fn()
		const element = createBatchElement("element-2", 2)
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResults: vi.fn().mockResolvedValue({
							project_id: "project-1",
							image_id: "batch-1",
							model_id: "model-a",
							prompt: "Generate",
							size: "1024x1024",
							file_dir: "/images/",
							generate_num: 3,
							status: "completed",
							error_message: null,
							images: [{ index: 2, file_name: "result_2.png", file_url: null }],
						}),
					},
				},
			},
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn(() => element),
				update,
				batchDelete: vi.fn(),
			},
			eventEmitter: {
				emit,
				on: vi.fn(() => vi.fn()),
			},
		}
		const registry = {
			track: vi.fn(),
			untrack: vi.fn(),
		}
		const manager = new ImageBatchPollingManager({
			canvas: canvas as never,
			imageId: "batch-1",
			elementIds: ["element-2"],
			outputIndexes: [2],
			registry: registry as never,
		})

		await manager.start()

		expect(update).toHaveBeenCalledWith(
			"element-2",
			expect.objectContaining({
				status: "completed",
				src: "images/result_2.png",
				imageGenerationTaskMeta: undefined,
			}),
			{ silent: false },
		)
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:resultUpdated",
			data: { elementId: "element-2" },
		})
	})

	it("deletes a restored batch when the backend confirms that exact task is missing", async () => {
		const elements = new Map([
			["element-1", createBatchElement("element-1", 1)],
			["element-2", createBatchElement("element-2", 2)],
		])
		const batchDelete = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResults: vi.fn().mockRejectedValue({
							code: 14000,
							message: "batch-1 未找到",
						}),
					},
				},
			},
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn((elementId: string) => elements.get(elementId)),
				batchDelete,
				update: vi.fn(),
			},
			eventEmitter: {
				emit: vi.fn(),
				on: vi.fn(() => vi.fn()),
			},
		}
		const registry = { track: vi.fn(), untrack: vi.fn() }
		const manager = new ImageBatchPollingManager({
			canvas: canvas as never,
			imageId: "batch-1",
			elementIds: ["element-1", "element-2"],
			registry: registry as never,
		})

		await manager.start()

		expect(batchDelete).toHaveBeenCalledOnce()
		expect(batchDelete).toHaveBeenCalledWith(["element-1", "element-2"])
	})

	it("does not delete an element that has moved to a newer batch task", async () => {
		const elements = new Map([["element-1", createBatchElement("element-1", 1, "newer-batch")]])
		const batchDelete = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getImageGenerationResults: vi.fn().mockRejectedValue({
							code: 14000,
							message: "batch-1 未找到",
						}),
					},
				},
			},
			elementManager: {
				getElementData: vi.fn((elementId: string) => elements.get(elementId)),
				batchDelete,
				update: vi.fn(),
			},
			eventEmitter: {
				emit: vi.fn(),
				on: vi.fn(() => vi.fn()),
			},
		}
		const registry = { track: vi.fn(), untrack: vi.fn() }
		const manager = new ImageBatchPollingManager({
			canvas: canvas as never,
			imageId: "batch-1",
			elementIds: ["element-1"],
			registry: registry as never,
		})

		await manager.start()

		expect(batchDelete).not.toHaveBeenCalled()
	})
})
