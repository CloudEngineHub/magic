import { describe, expect, it, vi } from "vitest"
import { ImageBatchPollingManager } from "../polling/ImageBatchPollingManager"

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
				update: vi.fn(),
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
				update: vi.fn(),
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
				update,
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
})
