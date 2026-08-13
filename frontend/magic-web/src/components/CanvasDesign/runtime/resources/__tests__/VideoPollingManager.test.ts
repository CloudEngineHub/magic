import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type VideoElement } from "../../document/types"
import { GenerationStatus } from "../../../public/magic-types"
import { VideoPollingManager } from "../polling/VideoPollingManager"

describe("VideoPollingManager", () => {
	it("clears a persisted video task when the backend confirms that exact task is missing", async () => {
		const element: VideoElement = {
			id: "video-element-1",
			type: ElementTypeEnum.Video,
			x: 0,
			y: 0,
			width: 512,
			height: 288,
			zIndex: 1,
			status: GenerationStatus.Processing,
			generateVideoRequest: {
				video_id: "video-task-1",
				model_id: "model-1",
				prompt: "demo",
			},
		}
		const update = vi.fn((elementId: string, updates: Partial<VideoElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		const emit = vi.fn()
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						getVideoGenerationResult: vi.fn().mockRejectedValue({
							code: 14000,
							message: "video-task-1 未找到",
						}),
					},
				},
			},
			elementManager: { update },
			eventEmitter: { emit },
		}

		const manager = new VideoPollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})

		manager.start()

		await vi.waitFor(() => expect(update).toHaveBeenCalled())
		expect(update).toHaveBeenCalledWith(
			element.id,
			{
				generateVideoRequest: undefined,
				videoGenerationResultMeta: undefined,
				status: undefined,
				errorMessage: undefined,
			},
			{ silent: false },
		)
		expect(emit).toHaveBeenCalledWith({
			type: "element:video:generate-submit-failed",
			data: { elementId: element.id },
		})
	})
})
