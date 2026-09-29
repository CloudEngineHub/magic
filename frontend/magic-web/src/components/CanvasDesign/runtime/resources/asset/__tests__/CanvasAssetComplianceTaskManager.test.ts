import { afterEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum, type ImageElement } from "../../../document/types"
import { CanvasAssetComplianceTaskManager } from "../CanvasAssetComplianceTaskManager"
import { CanvasAssetCompliancePollingManager } from "../CanvasAssetCompliancePollingManager"

function createTaskManager(options?: {
	getAssetComplianceStatus?: ReturnType<typeof vi.fn>
	canWrite?: boolean
}) {
	const getAssetComplianceStatus =
		options?.getAssetComplianceStatus ??
		vi.fn().mockResolvedValue({
			assetId: "check-1",
			status: "PASS",
			failedReason: null,
		})

	const canvas = {
		magicConfigManager: {
			config: {
				methods: { getAssetComplianceStatus },
			},
		},
		permissionManager: {
			can: () => options?.canWrite ?? true,
		},
		elementManager: {
			getElementData: () =>
				({
					id: "image-1",
					type: ElementTypeEnum.Image,
					contents: [
						{
							contentId: "content-1",
							src: "workspace://images/demo.png",
						},
					],
				}) as ImageElement,
			update: vi.fn(),
			getAllElements: () => [],
		},
		assetResourceManager: {
			getCachedResource: () => undefined,
			refreshResources: vi.fn().mockResolvedValue(new Map()),
		},
	}
	const pollingManager = new CanvasAssetCompliancePollingManager(canvas as never)
	const taskManager = new CanvasAssetComplianceTaskManager({
		assetCompliancePollingManager: pollingManager,
		assetResourceManager: canvas.assetResourceManager as never,
		elementManager: canvas.elementManager as never,
		permissionManager: canvas.permissionManager as never,
	})

	return { taskManager, getAssetComplianceStatus, canvas }
}

afterEach(() => {
	vi.useRealTimers()
})

describe("CanvasAssetComplianceTaskManager", () => {
	it("starts workspace compliance and persists processing before polling settles", async () => {
		vi.useFakeTimers()
		const getAssetComplianceStatus = vi
			.fn()
			.mockResolvedValueOnce({
				assetId: "check-1",
				status: "PROCESSING",
				failedReason: null,
			})
			.mockResolvedValueOnce({
				assetId: "check-1",
				status: "PASS",
				failedReason: null,
			})
		const startWorkspaceMediaCompliance = vi.fn().mockResolvedValue({
			assetId: "check-1",
			mediaType: "image",
			fileUrl: null,
		})
		const onSettled = vi.fn()
		const { taskManager, canvas } = createTaskManager({ getAssetComplianceStatus })

		const checkId = await taskManager.startWorkspaceFileCompliance(
			{
				path: "workspace://images/demo.png",
				name: "Demo",
				persistTarget: {
					elementId: "image-1",
					contentId: "content-1",
					sourcePath: "workspace://images/demo.png",
				},
				startWorkspaceMediaCompliance,
			},
			{ onSettled },
		)

		expect(checkId).toBe("check-1")
		expect(startWorkspaceMediaCompliance).toHaveBeenCalledWith({
			path: "workspace://images/demo.png",
			name: "Demo",
		})
		expect(canvas.elementManager.update).toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(2500)
		expect(onSettled).toHaveBeenCalledWith({
			assetId: "check-1",
			status: "PASS",
			failedReason: null,
		})
	})

	it("resumes document compliance without creating a new asset", () => {
		const getAssetComplianceStatus = vi.fn().mockResolvedValue({
			assetId: "check-resume",
			status: "PROCESSING",
			failedReason: null,
		})
		const { taskManager, canvas } = createTaskManager({ getAssetComplianceStatus })
		canvas.elementManager.getAllElements = () =>
			[
				{
					id: "image-1",
					type: ElementTypeEnum.Image,
					contents: [
						{
							contentId: "content-1",
							src: "workspace://images/demo.png",
							complianceStatus: "PROCESSING",
							complianceCheckId: "check-resume",
						},
					],
				},
			] as never

		taskManager.resumeDocumentCompliancePolling()

		expect(getAssetComplianceStatus).toHaveBeenCalledWith("check-resume")
	})

	it("starts library compliance without persisting to document", async () => {
		vi.useFakeTimers()
		const getAssetComplianceStatus = vi
			.fn()
			.mockResolvedValueOnce({
				assetId: "asset-lib",
				status: "PROCESSING",
				failedReason: null,
			})
			.mockResolvedValueOnce({
				assetId: "asset-lib",
				status: "PASS",
				failedReason: null,
			})
		const startExistingAssetCompliance = vi.fn().mockResolvedValue({
			assetId: "unexpected-response-id",
			mediaType: "image",
			fileUrl: null,
		})
		const onSettled = vi.fn()
		const { taskManager, canvas } = createTaskManager({ getAssetComplianceStatus })

		const pollAssetId = await taskManager.startLibraryAssetCompliance(
			{
				assetId: "asset-lib",
				fileKey: "private/demo.png",
				name: "Demo",
				startExistingAssetCompliance,
			},
			onSettled,
		)

		expect(pollAssetId).toBe("asset-lib")
		expect(startExistingAssetCompliance).toHaveBeenCalledWith({
			assetId: "asset-lib",
			fileKey: "private/demo.png",
			name: "Demo",
		})
		expect(canvas.elementManager.update).not.toHaveBeenCalled()

		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(2500)
		expect(onSettled).toHaveBeenCalledWith({
			assetId: "asset-lib",
			status: "PASS",
			failedReason: null,
		})
	})
})
