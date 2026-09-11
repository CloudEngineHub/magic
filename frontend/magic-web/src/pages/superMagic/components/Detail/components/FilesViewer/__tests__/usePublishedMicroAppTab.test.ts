import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { usePublishedMicroAppTab } from "../hooks/usePublishedMicroAppTab"

describe("usePublishedMicroAppTab", () => {
	it("opens a published micro-app tab keyed by app id and reuses it on repeat open", () => {
		const { result } = renderHook(() => usePublishedMicroAppTab())

		act(() => {
			result.current.openPublishedMicroAppTab({
				appId: "app-1",
				appName: "深圳卓悦线上内购",
			})
		})

		expect(result.current.publishedMicroAppTabs).toHaveLength(1)
		expect(result.current.publishedMicroAppTabs[0]).toMatchObject({
			id: "__micro_app__app-1",
			type: "micro_app",
			title: "深圳卓悦线上内购",
			active: true,
			closeable: true,
		})
		expect(result.current.isPublishedMicroAppTab("__micro_app__app-1")).toBe(true)

		act(() => {
			result.current.openPublishedMicroAppTab({
				appId: "app-2",
				appName: "另一个应用",
			})
		})

		expect(result.current.publishedMicroAppTabs).toHaveLength(2)
		expect(
			result.current.publishedMicroAppTabs.find((tab) => tab.id === "__micro_app__app-1")
				?.active,
		).toBe(false)
		expect(
			result.current.publishedMicroAppTabs.find((tab) => tab.id === "__micro_app__app-2")
				?.active,
		).toBe(true)

		act(() => {
			result.current.openPublishedMicroAppTab({
				appId: "app-1",
				appName: "深圳卓悦线上内购",
			})
		})

		expect(result.current.publishedMicroAppTabs).toHaveLength(2)
		expect(
			result.current.publishedMicroAppTabs.find((tab) => tab.id === "__micro_app__app-1")
				?.active,
		).toBe(true)
	})

	it("ignores empty app ids", () => {
		const { result } = renderHook(() => usePublishedMicroAppTab())

		act(() => {
			result.current.openPublishedMicroAppTab({ appId: "  " })
		})

		expect(result.current.publishedMicroAppTabs).toHaveLength(0)
	})
})
