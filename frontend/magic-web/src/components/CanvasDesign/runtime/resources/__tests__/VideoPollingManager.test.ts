import { describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type VideoElement } from "../../document/types"
import { getActiveContent } from "../../document/elementContent"
import { GenerationStatus } from "../../../public/magic-types"
import { createTestResourceReferenceResolver } from "../../../public/__tests__/testResourceReferenceResolver"
import { INVALID_GENERATED_RESOURCE_PATH_ERROR } from "../polling/generationPollingUtils"
import { VideoPollingManager } from "../polling/VideoPollingManager"

const resolveResourceReference = createTestResourceReferenceResolver()

function v3Video(fields: Record<string, unknown>): VideoElement {
	const { id, type, ...rest } = fields
	const contentId = `${String(id)}-content`
	const contentFields = {
		src: rest.src,
		status: rest.status,
		errorMessage: rest.errorMessage,
		generateVideoRequest: rest.generateVideoRequest,
		videoGenerationResultMeta: rest.videoGenerationResultMeta,
	}
	for (const field of Object.keys(contentFields)) delete rest[field]
	return {
		...rest,
		id,
		type,
		contents: [{ contentId, ...contentFields }],
		activeContentId: contentId,
		mainContentId: contentId,
	} as VideoElement
}

describe("VideoPollingManager", () => {
	it.each([
		["/画布A/videos/", "./videos/generated.mp4"],
		["/videos/", "/videos/generated.mp4"],
	])(
		"preserves the workspace namespace for generated video path %s",
		async (fileDir, expectedPath) => {
			const element = v3Video({
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
			})
			const update = vi.fn((elementId: string, updates: Partial<VideoElement>) => {
				if (elementId === element.id) Object.assign(element, updates)
			})
			const canvas = {
				magicConfigManager: {
					config: {
						methods: {
							resolveResourceReference,
							getVideoGenerationResult: vi.fn().mockResolvedValue({
								video_id: "video-task-1",
								status: GenerationStatus.Completed,
								error_message: null,
								file_dir: fileDir,
								file_name: "generated.mp4",
							}),
						},
					},
				},
				elementManager: { hasElement: vi.fn(() => true), update },
				eventEmitter: { emit: vi.fn() },
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
				expect.objectContaining({
					contents: [
						expect.objectContaining({
							src: expectedPath,
							status: GenerationStatus.Completed,
						}),
					],
				}),
				{ silent: false },
			)
		},
	)

	it("fails a completed result when its workspace path cannot be resolved", async () => {
		const element = v3Video({
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
		})
		const update = vi.fn((elementId: string, updates: Partial<VideoElement>) => {
			if (elementId === element.id) Object.assign(element, updates)
		})
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {
						resolveResourceReference: vi.fn(() => ({
							status: "invalid",
							rawReference: "/invalid/generated.mp4",
							candidates: [],
						})),
						getVideoGenerationResult: vi.fn().mockResolvedValue({
							video_id: "video-task-1",
							status: GenerationStatus.Completed,
							error_message: null,
							file_dir: "/invalid/",
							file_name: "generated.mp4",
						}),
					},
				},
			},
			elementManager: { hasElement: vi.fn(() => true), update },
			eventEmitter: { emit: vi.fn() },
		}
		const manager = new VideoPollingManager({
			elementId: element.id,
			canvas: canvas as never,
			getElementData: () => element,
		})

		manager.start()

		await vi.waitFor(() => expect(update).toHaveBeenCalled())
		expect(element).toEqual(
			expect.objectContaining({
				contents: [
					expect.objectContaining({
						status: GenerationStatus.Failed,
						errorMessage: INVALID_GENERATED_RESOURCE_PATH_ERROR,
					}),
				],
			}),
		)
		expect(getActiveContent(element)?.src).toBeUndefined()
	})

	it("clears a persisted video task when the backend confirms that exact task is missing", async () => {
		const element = v3Video({
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
		})
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
			expect.objectContaining({
				contents: [
					expect.objectContaining({
						generateVideoRequest: undefined,
						videoGenerationResultMeta: undefined,
						status: undefined,
						errorMessage: undefined,
					}),
				],
			}),
			{ silent: false },
		)
		expect(emit).toHaveBeenCalledWith({
			type: "element:video:generate-submit-failed",
			data: { elementId: element.id },
		})
	})
})
