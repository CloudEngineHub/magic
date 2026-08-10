import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import useDatabaseRefresh from "../useDatabaseRefresh"

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: () => undefined },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

describe("useDatabaseRefresh", () => {
	it("ignores repeated refresh calls while the first refresh is pending", async () => {
		let resolveTables: (() => void) | undefined
		const refreshTables = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveTables = resolve
				}),
		)
		const refreshTable = vi.fn().mockResolvedValue(undefined)
		const refreshRows = vi.fn().mockResolvedValue(undefined)
		const { result } = renderHook(() =>
			useDatabaseRefresh({ refreshTables, refreshTable, refreshRows }),
		)

		act(() => {
			void result.current.refresh()
			void result.current.refresh()
		})

		expect(refreshTables).toHaveBeenCalledTimes(1)
		expect(refreshTable).toHaveBeenCalledTimes(1)
		expect(refreshRows).toHaveBeenCalledTimes(1)
		expect(result.current.refreshing).toBe(true)

		resolveTables?.()
		await waitFor(() => expect(result.current.refreshing).toBe(false))
	})

	it("stays refreshing until every request settles after one request fails", async () => {
		let resolveRows: (() => void) | undefined
		const refreshRows = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveRows = resolve
				}),
		)
		const { result } = renderHook(() =>
			useDatabaseRefresh({
				refreshTables: vi.fn().mockRejectedValue(new Error("failed")),
				refreshTable: vi.fn().mockResolvedValue(undefined),
				refreshRows,
			}),
		)

		act(() => {
			void result.current.refresh()
		})
		await waitFor(() => expect(result.current.refreshing).toBe(true))
		expect(refreshRows).toHaveBeenCalledTimes(1)

		resolveRows?.()
		await waitFor(() => expect(result.current.refreshing).toBe(false))
	})
})
