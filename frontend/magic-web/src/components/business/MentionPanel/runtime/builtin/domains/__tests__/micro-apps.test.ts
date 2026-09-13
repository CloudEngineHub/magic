import { beforeEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "../../../../types"
import { MentionPanelMicroAppsStore } from "../micro-apps"

const mocks = vi.hoisted(() => ({
	getMentionMicroApps: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMentionMicroApps: mocks.getMentionMicroApps,
	},
}))

describe("MentionPanelMicroAppsStore", () => {
	beforeEach(() => {
		mocks.getMentionMicroApps.mockReset()
	})

	it("loads published mention apps from the dedicated endpoint", async () => {
		mocks.getMentionMicroApps.mockResolvedValue({
			list: [
				{
					app_id: "owned-1",
					app_name: "Owned App",
					cover_url: "https://cdn.example.com/owned.png",
					publish_status: "published",
				},
				{
					app_id: "draft-1",
					app_name: "Draft App",
					cover_url: "",
					publish_status: "unpublished",
				},
				{
					app_id: "shared-1",
					app_name: "Org Shared App",
					cover_url: "",
					publish_status: "published",
				},
			],
		})

		const store = new MentionPanelMicroAppsStore()
		const items = await store.getItems()

		expect(mocks.getMentionMicroApps).toHaveBeenCalledTimes(1)
		expect(mocks.getMentionMicroApps).toHaveBeenCalledWith({
			page: 1,
			page_size: 100,
		})
		expect(items).toEqual([
			{
				id: "owned-1",
				type: MentionItemType.MICRO_APP,
				name: "Owned App",
				icon: "https://cdn.example.com/owned.png",
				hasChildren: false,
				isFolder: false,
				data: { app_id: "owned-1", app_name: "Owned App" },
			},
			{
				id: "shared-1",
				type: MentionItemType.MICRO_APP,
				name: "Org Shared App",
				icon: "",
				hasChildren: false,
				isFolder: false,
				data: { app_id: "shared-1", app_name: "Org Shared App" },
			},
		])
	})

	it("retries catalog load after a failed request", async () => {
		mocks.getMentionMicroApps.mockRejectedValueOnce(new Error("unavailable"))

		const store = new MentionPanelMicroAppsStore()
		await expect(store.getItems()).resolves.toEqual([])

		mocks.getMentionMicroApps.mockResolvedValue({
			list: [
				{
					app_id: "owned-1",
					app_name: "Owned App",
					cover_url: "",
					publish_status: "published",
				},
			],
		})

		await expect(store.getItems()).resolves.toEqual([
			expect.objectContaining({ id: "owned-1", name: "Owned App" }),
		])
		expect(mocks.getMentionMicroApps).toHaveBeenCalledTimes(2)
	})

	it("refetches mention apps when the catalog is opened again", async () => {
		mocks.getMentionMicroApps
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "owned-1",
						app_name: "Owned App",
						cover_url: "",
						publish_status: "published",
					},
				],
			})
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "owned-2",
						app_name: "New App",
						cover_url: "",
						publish_status: "published",
					},
				],
			})

		const store = new MentionPanelMicroAppsStore()
		await expect(store.getItems()).resolves.toEqual([
			expect.objectContaining({ id: "owned-1", name: "Owned App" }),
		])
		await expect(store.getItems()).resolves.toEqual([
			expect.objectContaining({ id: "owned-2", name: "New App" }),
		])
		expect(mocks.getMentionMicroApps).toHaveBeenCalledTimes(2)
	})

	it("keeps the last catalog when a later request fails", async () => {
		mocks.getMentionMicroApps
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "owned-1",
						app_name: "Owned App",
						cover_url: "",
						publish_status: "published",
					},
				],
			})
			.mockRejectedValueOnce(new Error("unavailable"))

		const store = new MentionPanelMicroAppsStore()
		await store.getItems()

		await expect(store.getItems()).resolves.toEqual([
			expect.objectContaining({ id: "owned-1", name: "Owned App" }),
		])
		expect(mocks.getMentionMicroApps).toHaveBeenCalledTimes(2)
	})

	it("searches mention apps with a server keyword", async () => {
		mocks.getMentionMicroApps.mockResolvedValue({
			list: [
				{
					app_id: "shared-1",
					app_name: "Org Shared App",
					cover_url: "",
					publish_status: "published",
				},
			],
		})

		const store = new MentionPanelMicroAppsStore()
		const items = await store.searchItems("org", (target, query) =>
			target.toLowerCase().includes(query.toLowerCase()),
		)

		expect(mocks.getMentionMicroApps).toHaveBeenCalledWith({
			page: 1,
			page_size: 100,
			keyword: "org",
		})
		expect(items).toEqual([expect.objectContaining({ id: "shared-1", name: "Org Shared App" })])
	})

	it("falls back to the catalog cache when search fails", async () => {
		mocks.getMentionMicroApps
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "owned-1",
						app_name: "Owned App",
						cover_url: "",
						publish_status: "published",
					},
				],
			})
			.mockRejectedValueOnce(new Error("unavailable"))

		const store = new MentionPanelMicroAppsStore()
		await store.getItems()

		await expect(
			store.searchItems("owned", (target, query) =>
				target.toLowerCase().includes(query.toLowerCase()),
			),
		).resolves.toEqual([expect.objectContaining({ id: "owned-1", name: "Owned App" })])
	})
})
