import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import {
	__resetProjectFileImagePreviewCoordinatorForTests,
	cancelProjectFileImagePreviewRequest,
	projectFileImagePreviewCoordinatorConfig,
	requestProjectFileImagePreview,
	requestProjectFileImagePreviewBatch,
} from "./projectFileImagePreviewCoordinator"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

function createSource(index: number) {
	return {
		fileId: `file-${index}`,
		cacheKey: `file-${index}|png|image-${index}.png|version-1`,
	}
}

function createRows(fileIds: string[]) {
	return fileIds.map((fileId) => ({
		file_id: fileId,
		url: `https://cdn.example.com/${fileId}.webp?signature=stable`,
		expires_at: "2099-01-01 00:00:00",
	}))
}

describe("projectFileImagePreviewCoordinator", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		__resetProjectFileImagePreviewCoordinatorForTests()
	})

	afterEach(() => {
		__resetProjectFileImagePreviewCoordinatorForTests()
		vi.useRealTimers()
	})

	it("reuses the exact valid signed url without another exchange", async () => {
		const source = createSource(1)
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce(createRows([source.fileId]))

		const firstRequest = requestProjectFileImagePreview(source)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		const firstResult = await firstRequest
		const secondResult = await requestProjectFileImagePreview(source)

		expect(firstResult).toEqual({
			status: "loaded",
			item: {
				url: "https://cdn.example.com/file-1.webp?signature=stable",
				expiresAt: "2099-01-01 00:00:00",
			},
		})
		expect(secondResult).toEqual(firstResult)
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("keeps signed urls in memory only and exchanges again after reset", async () => {
		const source = createSource(2)
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValue(createRows([source.fileId]))

		const firstRequest = requestProjectFileImagePreview(source)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		await firstRequest

		const persistedPreviewKeys = Array.from(
			{ length: window.sessionStorage.length },
			(_, index) => window.sessionStorage.key(index),
		).filter((key) => key?.startsWith("magic:project-file-image-preview:v3:"))
		expect(persistedPreviewKeys).toEqual([])

		__resetProjectFileImagePreviewCoordinatorForTests()
		const secondRequest = requestProjectFileImagePreview(source)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		await secondRequest

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(2)
	})

	it("removes legacy persisted preview entries without touching unrelated session data", () => {
		const legacyKey = "magic:project-file-image-preview:v3:legacy-preview"
		const unrelatedKey = "project-file-image-preview-test:unrelated"
		window.sessionStorage.setItem(legacyKey, "signed-url")
		window.sessionStorage.setItem(unrelatedKey, "keep")

		__resetProjectFileImagePreviewCoordinatorForTests()

		expect(window.sessionStorage.getItem(legacyKey)).toBeNull()
		expect(window.sessionStorage.getItem(unrelatedKey)).toBe("keep")
		window.sessionStorage.removeItem(unrelatedKey)
	})

	it("distinguishes unavailable previews from failed exchanges", async () => {
		const unavailableSource = createSource(20)
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce([])

		const unavailableRequest = requestProjectFileImagePreview(unavailableSource)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		await expect(unavailableRequest).resolves.toEqual({ status: "unavailable" })

		const failedSource = createSource(21)
		const exchangeError = new Error("temporary exchange failure")
		vi.mocked(getTemporaryDownloadUrl).mockRejectedValueOnce(exchangeError)

		const failedRequest = requestProjectFileImagePreview(failedSource)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		await expect(failedRequest).resolves.toEqual({
			status: "failed",
			error: exchangeError,
		})
	})

	it("deduplicates the same cache key while its exchange is in flight", async () => {
		const source = createSource(3)
		let resolveExchange!: (rows: ReturnType<typeof createRows>) => void
		vi.mocked(getTemporaryDownloadUrl).mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveExchange = resolve
				}),
		)

		const firstRequest = requestProjectFileImagePreview(source)
		const secondRequest = requestProjectFileImagePreview(source)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		resolveExchange(createRows([source.fileId]))
		await expect(firstRequest).resolves.toEqual(await secondRequest)
	})

	it("cancels a queued exchange only after its last consumer leaves", async () => {
		const sharedSource = createSource(4)
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce(createRows([sharedSource.fileId]))
		const firstConsumer = requestProjectFileImagePreview(sharedSource)
		const secondConsumer = requestProjectFileImagePreview(sharedSource)

		cancelProjectFileImagePreviewRequest(sharedSource.cacheKey)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
		await expect(Promise.all([firstConsumer, secondConsumer])).resolves.toEqual([
			{
				status: "loaded",
				item: expect.objectContaining({
					url: expect.stringContaining(sharedSource.fileId),
				}),
			},
			{
				status: "loaded",
				item: expect.objectContaining({
					url: expect.stringContaining(sharedSource.fileId),
				}),
			},
		])

		const abandonedSource = createSource(5)
		const abandonedRequest = requestProjectFileImagePreview(abandonedSource)
		cancelProjectFileImagePreviewRequest(abandonedSource.cacheKey)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)

		await expect(abandonedRequest).resolves.toEqual({ status: "cancelled" })
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("keeps get-file-url batches within the fixed global concurrency limit", async () => {
		const sources = Array.from(
			{ length: projectFileImagePreviewCoordinatorConfig.batchSize * 2 + 1 },
			(_, index) => createSource(index + 10),
		)
		const pendingResolvers: Array<(value: ReturnType<typeof createRows>) => void> = []
		vi.mocked(getTemporaryDownloadUrl).mockImplementation(
			({ file_ids }) =>
				new Promise((resolve) => {
					pendingResolvers.push(() => resolve(createRows(file_ids)))
				}),
		)

		const allRequests = requestProjectFileImagePreviewBatch(sources)

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(
			projectFileImagePreviewCoordinatorConfig.maxConcurrency,
		)
		pendingResolvers[0](createRows([]))
		await Promise.resolve()
		await Promise.resolve()
		await vi.runOnlyPendingTimersAsync()

		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(3)
		for (let index = 1; index < pendingResolvers.length; index += 1) {
			pendingResolvers[index](createRows([]))
		}
		await allRequests
	})
})
