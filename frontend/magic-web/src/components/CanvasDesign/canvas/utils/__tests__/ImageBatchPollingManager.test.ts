import { describe, expect, it, vi } from "vitest"
import { ImageBatchPollingManager } from "../ImageBatchPollingManager"

describe("ImageBatchPollingManager", () => {
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
