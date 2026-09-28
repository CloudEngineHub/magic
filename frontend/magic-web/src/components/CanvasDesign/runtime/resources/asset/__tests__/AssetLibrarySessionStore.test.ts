import { beforeEach, describe, expect, it, vi } from "vitest"
import { assetLibrarySessionStore, type AssetLibraryQuery } from "../AssetLibrarySessionStore"

const mocks = vi.hoisted(() => ({
	queryAssets: vi.fn(),
	getAssetOwners: vi.fn(),
}))

vi.mock("@/apis", () => ({
	AssetsApi: {
		queryAssets: mocks.queryAssets,
		getAssetOwners: mocks.getAssetOwners,
	},
}))

const query: AssetLibraryQuery = {
	mediaTypes: ["IMAGE"],
	scope: "ALL",
	keyword: "",
	ownerUid: "",
	requiresCompliance: false,
}

function asset(id: string, mediaType: "IMAGE" | "VIDEO" = "IMAGE") {
	return {
		asset_id: id,
		asset_kind: "ASSET" as const,
		asset_business_type: null,
		asset_media_type: mediaType,
		parent_id: null,
		name: id,
		description: "",
		file_url: `https://example.com/${id}`,
		compliance_status: "UNVERIFIED" as const,
		compliance_failed_reason: null,
		owner: { id: "owner-1", name: "Owner" },
		owner_uid: "owner-1",
		source: "PERSONAL" as const,
		tags: [],
	}
}

function response(...items: ReturnType<typeof asset>[]) {
	return { page: 1, page_size: 200, total: items.length, list: items }
}

describe("AssetLibrarySessionStore", () => {
	beforeEach(() => {
		assetLibrarySessionStore.clearAll()
		mocks.queryAssets.mockReset()
		mocks.getAssetOwners.mockReset()
		mocks.getAssetOwners.mockResolvedValue([])
	})

	it("caches a completed query and reuses it on the next call", async () => {
		mocks.queryAssets.mockResolvedValue(response(asset("asset-1")))

		await expect(assetLibrarySessionStore.queryAssets(query, "scope-a")).resolves.toEqual([
			asset("asset-1"),
		])
		await expect(assetLibrarySessionStore.queryAssets(query, "scope-a")).resolves.toEqual([
			asset("asset-1"),
		])

		expect(mocks.queryAssets).toHaveBeenCalledTimes(1)
		expect(assetLibrarySessionStore.getCachedAssets(query, "scope-a")).toEqual([
			asset("asset-1"),
		])
	})

	it("shares a pending promise for concurrent requests", async () => {
		let resolveRequest: ((value: ReturnType<typeof response>) => void) | undefined
		mocks.queryAssets.mockReturnValue(
			new Promise((resolve) => {
				resolveRequest = resolve
			}),
		)

		const first = assetLibrarySessionStore.queryAssets(query, "scope-a")
		const second = assetLibrarySessionStore.queryAssets(query, "scope-a")

		expect(first).toBe(second)
		expect(mocks.queryAssets).toHaveBeenCalledTimes(1)
		resolveRequest?.(response(asset("asset-1")))
		await expect(first).resolves.toHaveLength(1)
	})

	it("deduplicates media types in caller order while using an order-independent cache key", async () => {
		mocks.queryAssets.mockImplementation(
			({ asset_media_type }: { asset_media_type: "IMAGE" | "VIDEO" }) =>
				Promise.resolve(response(asset(asset_media_type, asset_media_type))),
		)
		const imageAndVideo = { ...query, mediaTypes: ["IMAGE", "VIDEO"] as const }
		const videoAndImage = { ...query, mediaTypes: ["VIDEO", "IMAGE"] as const }

		await expect(
			assetLibrarySessionStore.queryAssets(imageAndVideo, "scope-a"),
		).resolves.toEqual([asset("IMAGE", "IMAGE"), asset("VIDEO", "VIDEO")])
		await assetLibrarySessionStore.queryAssets(videoAndImage, "scope-a")

		expect(mocks.queryAssets).toHaveBeenCalledTimes(2)
		expect(mocks.queryAssets.mock.calls.map(([params]) => params.asset_media_type)).toEqual([
			"IMAGE",
			"VIDEO",
		])
	})

	it("refreshes only the current query and keeps old assets when refresh fails", async () => {
		mocks.queryAssets
			.mockResolvedValueOnce(response(asset("old")))
			.mockRejectedValueOnce(new Error("refresh failed"))
		await assetLibrarySessionStore.queryAssets(query, "scope-a")

		await expect(assetLibrarySessionStore.refreshAssets(query, "scope-a")).rejects.toThrow(
			"refresh failed",
		)
		expect(assetLibrarySessionStore.getCachedAssets(query, "scope-a")).toEqual([asset("old")])
		expect(
			assetLibrarySessionStore.getSnapshotByKey(
				assetLibrarySessionStore.getQueryKey(query, "scope-a"),
				"scope-a",
			).error,
		).toEqual(new Error("refresh failed"))
	})

	it("isolates list and owner caches by scope", async () => {
		mocks.queryAssets.mockResolvedValue(response(asset("asset-a")))
		mocks.getAssetOwners.mockResolvedValue([{ id: "owner-1", name: "Owner" }])

		await assetLibrarySessionStore.queryAssets(query, "scope-a")
		await assetLibrarySessionStore.getOwners("scope-a")
		await assetLibrarySessionStore.queryAssets(query, "scope-b")
		await assetLibrarySessionStore.getOwners("scope-b")

		expect(mocks.queryAssets).toHaveBeenCalledTimes(2)
		expect(mocks.getAssetOwners).toHaveBeenCalledTimes(2)
	})

	it("invalidates all list queries in the current scope but keeps owner data", async () => {
		mocks.queryAssets.mockResolvedValue(response(asset("asset-1")))
		await assetLibrarySessionStore.queryAssets(query, "scope-a")
		await assetLibrarySessionStore.queryAssets({ ...query, keyword: "other" }, "scope-a")
		await assetLibrarySessionStore.getOwners("scope-a")

		assetLibrarySessionStore.invalidateCurrentScope("scope-a")
		mocks.queryAssets.mockResolvedValue(response(asset("asset-2")))
		await assetLibrarySessionStore.queryAssets(query, "scope-a")
		await assetLibrarySessionStore.getOwners("scope-a")

		expect(mocks.queryAssets).toHaveBeenCalledTimes(3)
		expect(mocks.getAssetOwners).toHaveBeenCalledTimes(1)
	})
})
