import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	getMicroAppAvailableScopes,
	normalizeMicroAppListResponse,
	normalizeMicroAppListScope,
	isPublishedShareScope,
	useMicroAppsPage,
} from "../useMicroAppsPage"

const mocks = vi.hoisted(() => ({
	getMicroAppWorkspace: vi.fn(),
	getMicroApps: vi.fn(),
	updateMicroApp: vi.fn(),
	deleteMicroApp: vi.fn(),
	user: { isPersonalOrganization: false },
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppWorkspace: mocks.getMicroAppWorkspace,
		getMicroApps: mocks.getMicroApps,
		updateMicroApp: mocks.updateMicroApp,
		deleteMicroApp: mocks.deleteMicroApp,
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: mocks.user,
	},
}))

describe("useMicroAppsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.user.isPersonalOrganization = false
		mocks.getMicroAppWorkspace.mockResolvedValue({ id: "workspace-1", name: "Micro Apps" })
		mocks.getMicroApps.mockResolvedValue({
			list: [
				{
					app_id: "100000000000009001",
					app_name: "客户跟进助手",
					app_description: "客户跟进与提醒工具",
					creator_id: "user-1",
					cover_url: "https://cdn.example.com/cover.png",
					publish_status: "published",
					updated_at: "2026-07-24 10:30:00",
				},
			],
			total: 21,
			page: 1,
			page_size: 20,
		})
		mocks.updateMicroApp.mockResolvedValue({
			app_id: "100000000000009001",
			app_name: "更新后的应用",
			updated_at: "2026-08-04 12:00:00",
		})
		mocks.deleteMicroApp.mockResolvedValue({
			app_id: "100000000000009001",
			project_id: "100000000000009002",
			deleted: true,
		})
	})

	it("loads the new app list with the default scope", async () => {
		const { result } = renderHook(() => useMicroAppsPage())

		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(mocks.getMicroApps).toHaveBeenCalledWith({
			page: 1,
			page_size: 20,
			keyword: "",
			scope: "all",
		})
		expect(result.current.apps).toHaveLength(1)
		expect(result.current.apps[0].app_id).toBe("100000000000009001")
		expect(result.current.apps[0].can_delete).toBe(true)
		expect(result.current.hasMore).toBe(true)
	})

	it("reloads with scope and keyword, then appends the next page", async () => {
		mocks.getMicroApps
			.mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 })
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "app-2",
						app_name: "协作应用",
						app_description: "",
						creator_id: "user-2",
						cover_url: "",
						publish_status: "unpublished",
						updated_at: null,
					},
				],
				total: 2,
				page: 1,
				page_size: 20,
			})
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "app-3",
						app_name: "第二个协作应用",
						app_description: "",
						creator_id: "user-3",
						cover_url: "",
						publish_status: "published",
						updated_at: null,
					},
				],
				total: 2,
				page: 2,
				page_size: 20,
			})

		const { result } = renderHook(() => useMicroAppsPage())
		await waitFor(() => expect(result.current.loading).toBe(false))

		act(() => {
			result.current.setScope("collaborated")
			result.current.setKeyword("协作")
		})
		await waitFor(() => expect(result.current.apps[0]?.app_id).toBe("app-2"))

		expect(mocks.getMicroApps).toHaveBeenLastCalledWith({
			page: 1,
			page_size: 20,
			keyword: "协作",
			scope: "collaborated",
		})

		await act(async () => {
			await result.current.loadMore()
		})

		expect(result.current.apps.map((app) => app.app_id)).toEqual(["app-2", "app-3"])
		expect(mocks.getMicroApps).toHaveBeenLastCalledWith({
			page: 2,
			page_size: 20,
			keyword: "协作",
			scope: "collaborated",
		})
	})

	it("normalizes wrapped responses and stringifies ids", () => {
		expect(
			normalizeMicroAppListResponse({
				data: {
					list: [
						{
							app_id: "100000000000009001",
							app_name: "App",
							can_delete: false,
						},
					],
					total: 1,
					page: 1,
					page_size: 20,
				},
			}),
		).toEqual({
			list: [
				{
					app_id: "100000000000009001",
					project_id: "",
					app_name: "App",
					app_description: "",
					creator_id: "",
					cover_url: "",
					publish_status: "unpublished",
					updated_at: null,
					can_delete: false,
					user_role: undefined,
				},
			],
			total: 1,
			page: 1,
			page_size: 20,
		})
	})

	it("keeps returned apps visible when workspace loading fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mocks.getMicroAppWorkspace.mockRejectedValue(new Error("invalid workspace code"))

		const { result } = renderHook(() => useMicroAppsPage())
		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(mocks.getMicroApps).toHaveBeenCalled()
		expect(result.current.apps).toHaveLength(1)
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Failed to load micro app workspace:",
			expect.any(Error),
		)
		consoleErrorSpy.mockRestore()
	})

	it("renames and removes an app with app_id", async () => {
		mocks.getMicroApps
			.mockResolvedValueOnce({
				list: [
					{
						app_id: "100000000000009001",
						app_name: "客户跟进助手",
						app_description: "客户跟进与提醒工具",
						creator_id: "user-1",
						cover_url: "https://cdn.example.com/cover.png",
						publish_status: "published",
						updated_at: "2026-07-24 10:30:00",
					},
				],
				total: 1,
				page: 1,
				page_size: 20,
			})
			.mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 20 })
		const { result } = renderHook(() => useMicroAppsPage())
		await waitFor(() => expect(result.current.loading).toBe(false))

		await act(async () => {
			await result.current.renameApp("100000000000009001", "更新后的应用")
		})

		expect(mocks.updateMicroApp).toHaveBeenCalledWith("100000000000009001", {
			app_name: "更新后的应用",
		})
		expect(result.current.apps[0]).toMatchObject({
			app_id: "100000000000009001",
			app_name: "更新后的应用",
			updated_at: "2026-08-04 12:00:00",
		})

		await act(async () => {
			await result.current.deleteApp("100000000000009001")
		})

		expect(mocks.deleteMicroApp).toHaveBeenCalledWith("100000000000009001")
		await waitFor(() => expect(mocks.getMicroApps).toHaveBeenCalledTimes(2))
		await waitFor(() => expect(result.current.loading).toBe(false))
		expect(result.current.apps).toEqual([])
		expect(result.current.hasMore).toBe(false)
	})

	it("treats recent and accessible scopes as published share views", () => {
		expect(isPublishedShareScope("recent")).toBe(true)
		expect(isPublishedShareScope("accessible")).toBe(true)
		expect(isPublishedShareScope("all")).toBe(false)
		expect(isPublishedShareScope("created")).toBe(false)
	})

	it("hides collaborated from personal organization scopes", () => {
		expect(getMicroAppAvailableScopes(true)).toEqual(["all", "created", "accessible", "recent"])
		expect(getMicroAppAvailableScopes(false)).toContain("collaborated")
		expect(normalizeMicroAppListScope("collaborated", true)).toBe("all")
		expect(normalizeMicroAppListScope("collaborated", false)).toBe("collaborated")
	})

	it("ignores collaborated scope in a personal organization", async () => {
		mocks.user.isPersonalOrganization = true
		const { result } = renderHook(() => useMicroAppsPage())
		await waitFor(() => expect(result.current.loading).toBe(false))

		act(() => {
			result.current.setScope("collaborated")
		})

		expect(result.current.scope).toBe("all")
		expect(result.current.availableScopes).not.toContain("collaborated")
		expect(mocks.getMicroApps).toHaveBeenLastCalledWith({
			page: 1,
			page_size: 20,
			keyword: "",
			scope: "all",
		})
	})

	it("falls back from collaborated when switching to a personal organization", async () => {
		const { result, rerender } = renderHook(() => useMicroAppsPage())
		await waitFor(() => expect(result.current.loading).toBe(false))

		act(() => {
			result.current.setScope("collaborated")
		})
		await waitFor(() =>
			expect(mocks.getMicroApps).toHaveBeenLastCalledWith({
				page: 1,
				page_size: 20,
				keyword: "",
				scope: "collaborated",
			}),
		)

		mocks.user.isPersonalOrganization = true
		rerender()

		expect(result.current.scope).toBe("all")
		expect(result.current.availableScopes).not.toContain("collaborated")
		await waitFor(() =>
			expect(mocks.getMicroApps).toHaveBeenLastCalledWith({
				page: 1,
				page_size: 20,
				keyword: "",
				scope: "all",
			}),
		)
	})
})
