import { beforeEach, describe, expect, it, vi } from "vitest"

const { start, ImageBatchPollingManagerMock } = vi.hoisted(() => {
	const start = vi.fn()
	const ImageBatchPollingManagerMock = vi.fn().mockImplementation(() => ({
		start,
	}))

	return { start, ImageBatchPollingManagerMock }
})

vi.mock("../polling/ImageBatchPollingManager", () => ({
	ImageBatchPollingManager: ImageBatchPollingManagerMock,
}))

import { resumeImageBatchPollingManagers } from "../polling/resumeImageBatchPolling"

describe("resumeImageBatchPollingManagers", () => {
	beforeEach(() => {
		start.mockReset()
		ImageBatchPollingManagerMock.mockClear()
	})

	it("rebuilds batch polling from persisted batch image task meta", () => {
		const canvas = {
			elementManager: {
				getAllElements: vi.fn(() => [
					{
						id: "element-2",
						type: "image",
						status: "processing",
						imageGenerationTaskMeta: {
							type: "batch",
							image_id: "batch-1",
							output_index: 2,
							output_count: 3,
						},
					},
					{
						id: "element-3",
						type: "image",
						status: "processing",
						imageGenerationTaskMeta: {
							type: "batch",
							image_id: "batch-1",
							output_index: 3,
							output_count: 3,
						},
					},
					{
						id: "completed-element",
						type: "image",
						src: "/images/done.png",
						status: "completed",
						imageGenerationTaskMeta: {
							type: "batch",
							image_id: "batch-1",
							output_index: 1,
							output_count: 3,
						},
					},
				]),
			},
			imageBatchPollingRegistry: {
				get: vi.fn(() => undefined),
			},
		}

		resumeImageBatchPollingManagers(canvas as never)

		expect(ImageBatchPollingManagerMock).toHaveBeenCalledWith({
			canvas,
			imageId: "batch-1",
			elementIds: ["element-2", "element-3"],
			outputIndexes: [2, 3],
			registry: canvas.imageBatchPollingRegistry,
		})
		expect(start).toHaveBeenCalledTimes(1)
	})

	it("rebuilds polling from a processing batch task in a non-active image version", () => {
		const canvas = {
			elementManager: {
				getAllElements: vi.fn(() => [
					{
						id: "image-v2",
						type: "image",
						imageDslVersion: 2,
						activeVersionId: "v1",
						mainVersionId: "v1",
						versions: [
							{
								id: "v1",
								src: "/images/done.png",
								status: "completed",
							},
							{
								id: "v2",
								status: "processing",
								imageGenerationTaskMeta: {
									type: "batch",
									image_id: "batch-2",
									output_index: 1,
									output_count: 1,
								},
							},
						],
					},
				]),
			},
			imageBatchPollingRegistry: {
				get: vi.fn(() => undefined),
			},
		}

		resumeImageBatchPollingManagers(canvas as never)

		expect(ImageBatchPollingManagerMock).toHaveBeenCalledWith({
			canvas,
			imageId: "batch-2",
			elementIds: ["image-v2"],
			outputIndexes: [1],
			versionIds: ["v2"],
			registry: canvas.imageBatchPollingRegistry,
		})
		expect(start).toHaveBeenCalledTimes(1)
	})

	it("syncs element ids into an active batch polling manager", () => {
		const syncElementIds = vi.fn()
		const canvas = {
			elementManager: {
				getAllElements: vi.fn(() => [
					{
						id: "element-1",
						type: "image",
						status: "processing",
						imageGenerationTaskMeta: {
							type: "batch",
							image_id: "batch-1",
							output_index: 1,
							output_count: 1,
						},
					},
				]),
			},
			imageBatchPollingRegistry: {
				get: vi.fn(() => ({ syncElementIds })),
			},
		}

		resumeImageBatchPollingManagers(canvas as never)

		expect(ImageBatchPollingManagerMock).not.toHaveBeenCalled()
		expect(start).not.toHaveBeenCalled()
		expect(syncElementIds).toHaveBeenCalledWith(["element-1"], [1])
	})
})
