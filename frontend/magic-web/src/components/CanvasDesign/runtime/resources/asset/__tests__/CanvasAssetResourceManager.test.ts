import { describe, expect, it, vi } from "vitest"
import { CanvasAssetResourceManager } from "../CanvasAssetResourceManager"

function createManager(
	getAssetResourceInfo: ReturnType<typeof vi.fn> = vi.fn(),
	getAssetResourceInfos?: ReturnType<typeof vi.fn>,
) {
	const canvas = {
		magicConfigManager: {
			config: {
				methods: { getAssetResourceInfo, getAssetResourceInfos },
			},
		},
	}
	return {
		canvas,
		manager: new CanvasAssetResourceManager(canvas as never),
	}
}

describe("CanvasAssetResourceManager", () => {
	it("deduplicates concurrent detail requests and keeps the normalized result in memory", async () => {
		const getAssetResourceInfo = vi.fn().mockResolvedValue({
			assetId: "asset-1",
			mediaType: "image",
			fileUrl: " https://cdn.test/asset-1.png ",
			fileName: "asset-1.png",
			complianceStatus: "PASSED",
		})
		const { manager } = createManager(getAssetResourceInfo)

		const [first, second] = await Promise.all([
			manager.getResource("asset-1", { priority: "visible" }),
			manager.getResource("asset-1", { priority: "critical" }),
		])

		expect(getAssetResourceInfo).toHaveBeenCalledTimes(1)
		expect(first).toEqual({
			assetId: "asset-1",
			mediaType: "image",
			fileUrl: "https://cdn.test/asset-1.png",
			fileName: "asset-1.png",
			complianceStatus: "PASS",
		})
		expect(second).toBe(first)

		await manager.getResource("asset-1")
		expect(getAssetResourceInfo).toHaveBeenCalledTimes(1)
	})

	it("refreshes numeric asset ids through one batch request and deduplicates ids", async () => {
		const getAssetResourceInfos = vi.fn().mockImplementation(async (assetIds: string[]) =>
			assetIds.map((assetId) => ({
				assetId,
				mediaType: "image",
				fileUrl: `https://cdn.test/${assetId}.png`,
			})),
		)
		const { manager } = createManager(vi.fn(), getAssetResourceInfos)

		const resources = await manager.refreshResources(["100", "101", "100"])

		expect(getAssetResourceInfos).toHaveBeenCalledTimes(1)
		expect(getAssetResourceInfos).toHaveBeenCalledWith(["100", "101"])
		expect([...resources.keys()]).toEqual(["100", "101"])
	})

	it("splits batch refreshes into requests of at most 200 ids", async () => {
		const getAssetResourceInfos = vi.fn().mockImplementation(async (assetIds: string[]) =>
			assetIds.map((assetId) => ({
				assetId,
				mediaType: "video",
				fileUrl: `https://${assetId}`,
			})),
		)
		const { manager } = createManager(vi.fn(), getAssetResourceInfos)
		const assetIds = Array.from({ length: 201 }, (_, index) => String(index + 1))

		await manager.refreshResources(assetIds)

		expect(getAssetResourceInfos).toHaveBeenCalledTimes(2)
		expect(getAssetResourceInfos.mock.calls[0][0]).toHaveLength(200)
		expect(getAssetResourceInfos.mock.calls[1][0]).toHaveLength(1)
	})

	it("does not batch non-numeric legacy ids and normalizes old compliance values", async () => {
		const getAssetResourceInfo = vi.fn().mockResolvedValue({
			assetId: "reference.png",
			mediaType: "image",
			fileUrl: "https://cdn.test/reference.png",
			complianceStatus: "PASSED",
		})
		const getAssetResourceInfos = vi.fn()
		const { manager } = createManager(getAssetResourceInfo, getAssetResourceInfos)

		await expect(manager.getResource("reference.png")).resolves.toMatchObject({
			assetId: "reference.png",
			complianceStatus: "PASS",
		})
		expect(getAssetResourceInfo).toHaveBeenCalledWith("reference.png", undefined)
		expect(getAssetResourceInfos).not.toHaveBeenCalled()
	})

	it("falls back to the single resolver when a batch request fails", async () => {
		const getAssetResourceInfos = vi.fn().mockRejectedValue(new Error("batch unavailable"))
		const getAssetResourceInfo = vi.fn().mockResolvedValue({
			assetId: "123",
			mediaType: "audio",
			fileUrl: "https://cdn.test/audio.mp3",
		})
		const { manager } = createManager(getAssetResourceInfo, getAssetResourceInfos)

		await expect(manager.getResource("123")).resolves.toMatchObject({
			assetId: "123",
			mediaType: "audio",
		})
		expect(getAssetResourceInfos).toHaveBeenCalledWith(["123"])
		expect(getAssetResourceInfo).toHaveBeenCalledWith("123", undefined)
	})

	it("replaces a stale URL on force refresh", async () => {
		const getAssetResourceInfo = vi
			.fn()
			.mockResolvedValueOnce({
				assetId: "asset-1",
				mediaType: "video",
				fileUrl: "https://cdn.test/old.mp4",
			})
			.mockResolvedValueOnce({
				assetId: "asset-1",
				mediaType: "video",
				fileUrl: "https://cdn.test/new.mp4",
			})
		const { manager } = createManager(getAssetResourceInfo)

		await manager.getResource("asset-1")
		await expect(manager.getResource("asset-1", { forceRefresh: true })).resolves.toEqual(
			expect.objectContaining({ fileUrl: "https://cdn.test/new.mp4" }),
		)
		expect(getAssetResourceInfo).toHaveBeenCalledTimes(2)
	})

	it("maps the documented not-found response to a stable resource error", async () => {
		const error = Object.assign(new Error("asset unavailable"), { response: { code: 48000 } })
		const getAssetResourceInfo = vi.fn().mockRejectedValue(error)
		const { manager } = createManager(getAssetResourceInfo)

		await expect(manager.getResource("asset-404")).rejects.toMatchObject({
			name: "CanvasAssetResourceError",
			reason: "not-found",
		})
	})

	it("does not silently accept a response for another asset", async () => {
		const getAssetResourceInfo = vi.fn().mockResolvedValue({
			assetId: "another-asset",
			mediaType: "audio",
			fileUrl: "https://cdn.test/audio.mp3",
		})
		const { manager } = createManager(getAssetResourceInfo)

		await expect(manager.getResource("asset-1")).rejects.toMatchObject({
			name: "CanvasAssetResourceError",
			reason: "load-error",
		})
	})
})
