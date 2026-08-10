import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useHtmlPermissionManagerBridge } from "../useHtmlPermissionManagerBridge"

describe("useHtmlPermissionManagerBridge", () => {
	it("registers one manager handle only while permission management is available", async () => {
		const onManagerChange = vi.fn()
		const { result, rerender, unmount } = renderHook(
			({ available }) => useHtmlPermissionManagerBridge({ available, onManagerChange }),
			{ initialProps: { available: true } },
		)

		await waitFor(() => {
			expect(onManagerChange).toHaveBeenLastCalledWith(
				expect.objectContaining({ open: expect.any(Function) }),
			)
		})

		act(() => {
			onManagerChange.mock.lastCall?.[0]?.open()
		})
		expect(result.current.open).toBe(true)

		rerender({ available: false })

		await waitFor(() => {
			expect(result.current.open).toBe(false)
			expect(onManagerChange).toHaveBeenLastCalledWith(null)
		})

		unmount()
		expect(onManagerChange).toHaveBeenLastCalledWith(null)
	})
})
