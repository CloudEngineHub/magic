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
		const firstItem = await firstRequest
		const secondItem = await requestProjectFileImagePreview(source)

		expect(firstItem?.url).toBe("https://cdn.example.com/file-1.webp?signature=stable")
		expect(secondItem?.url).toBe(firstItem?.url)
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
	})

	it("restores a valid signed url from session storage after memory reset", async () => {
		const source = createSource(2)
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValueOnce(createRows([source.fileId]))

		const firstRequest = requestProjectFileImagePreview(source)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)
		const firstItem = await firstRequest

		__resetProjectFileImagePreviewCoordinatorForTests({ clearSession: false })
		const restoredItem = await requestProjectFileImagePreview(source)

		expect(restoredItem?.url).toBe(firstItem?.url)
		expect(getTemporaryDownloadUrl).toHaveBeenCalledTimes(1)
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
			expect.objectContaining({ url: expect.stringContaining(sharedSource.fileId) }),
			expect.objectContaining({ url: expect.stringContaining(sharedSource.fileId) }),
		])

		const abandonedSource = createSource(5)
		const abandonedRequest = requestProjectFileImagePreview(abandonedSource)
		cancelProjectFileImagePreviewRequest(abandonedSource.cacheKey)
		await vi.advanceTimersByTimeAsync(projectFileImagePreviewCoordinatorConfig.batchDelayMs)

		await expect(abandonedRequest).resolves.toBeUndefined()
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
