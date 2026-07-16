import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { slidesTemplateStatisticsStorage, useAnimatedNumber } from "../useAnimatedNumber"

const motionMock = vi.hoisted(() => ({
	animate: vi.fn(),
	prefersReducedMotion: false,
}))

vi.mock("framer-motion", () => ({
	animate: motionMock.animate,
	useReducedMotion: () => motionMock.prefersReducedMotion,
}))

interface AnimateOptions {
	onUpdate?: (value: number) => void
	onComplete?: () => void
}

describe("useAnimatedNumber", () => {
	beforeEach(() => {
		window.localStorage.clear()
		motionMock.animate.mockReset()
		motionMock.prefersReducedMotion = false
		motionMock.animate.mockImplementation(
			(_from: number, to: number, options?: AnimateOptions) => {
				options?.onUpdate?.(to)
				options?.onComplete?.()
				return { stop: vi.fn() }
			},
		)
	})

	it("animates from zero when no previous value exists", async () => {
		const { result } = renderHook(() => useAnimatedNumber(120, "total"))

		await waitFor(() => expect(result.current).toBe(120))
		expect(motionMock.animate).toHaveBeenCalledWith(
			0,
			120,
			expect.objectContaining({ duration: 0.8, ease: "easeOut" }),
		)
		expect(
			JSON.parse(
				window.localStorage.getItem(`${slidesTemplateStatisticsStorage.prefix}total`) ??
					"{}",
			),
		).toEqual(expect.objectContaining({ value: 120 }))
	})

	it("uses the persisted value after a page refresh", async () => {
		window.localStorage.setItem(
			`${slidesTemplateStatisticsStorage.prefix}total`,
			JSON.stringify({ value: 100, savedAt: Date.now() }),
		)

		renderHook(() => useAnimatedNumber(125, "total"))

		await waitFor(() => expect(motionMock.animate).toHaveBeenCalled())
		expect(motionMock.animate).toHaveBeenCalledWith(
			100,
			125,
			expect.objectContaining({ duration: 0.8 }),
		)
	})

	it("animates down when the latest server value is lower", async () => {
		window.localStorage.setItem(
			`${slidesTemplateStatisticsStorage.prefix}total`,
			JSON.stringify({ value: 140, savedAt: Date.now() }),
		)

		renderHook(() => useAnimatedNumber(125, "total"))

		await waitFor(() => expect(motionMock.animate).toHaveBeenCalled())
		expect(motionMock.animate).toHaveBeenCalledWith(
			140,
			125,
			expect.objectContaining({ duration: 0.8 }),
		)
	})

	it("continues from the currently rendered value on polling updates", async () => {
		const { rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value, "total"),
			{ initialProps: { value: 100 } },
		)
		await waitFor(() => expect(motionMock.animate).toHaveBeenCalledTimes(1))

		rerender({ value: 130 })

		await waitFor(() => expect(motionMock.animate).toHaveBeenCalledTimes(2))
		expect(motionMock.animate).toHaveBeenLastCalledWith(
			100,
			130,
			expect.objectContaining({ duration: 0.8 }),
		)
	})

	it("clears the rendered value when the server field becomes unavailable", async () => {
		const { result, rerender } = renderHook(
			({ value }: { value: number | undefined }) => useAnimatedNumber(value, "total"),
			{ initialProps: { value: 100 as number | undefined } },
		)
		await waitFor(() => expect(result.current).toBe(100))

		rerender({ value: undefined })

		await waitFor(() => expect(result.current).toBeUndefined())
	})

	it.each([
		["expired", JSON.stringify({ value: 80, savedAt: Date.now() - 25 * 60 * 60 * 1000 })],
		["invalid", "not-json"],
	])("shows the server value directly for %s persisted data", async (_label, storedValue) => {
		window.localStorage.setItem(`${slidesTemplateStatisticsStorage.prefix}total`, storedValue)

		const { result } = renderHook(() => useAnimatedNumber(125, "total"))

		await waitFor(() => expect(result.current).toBe(125))
		expect(motionMock.animate).not.toHaveBeenCalled()
	})

	it("shows the server value directly when storage is unavailable", async () => {
		const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})

		const { result } = renderHook(() => useAnimatedNumber(125, "total"))

		await waitFor(() => expect(result.current).toBe(125))
		expect(motionMock.animate).not.toHaveBeenCalled()
		getItemSpy.mockRestore()
	})

	it("skips animation when reduced motion is enabled", async () => {
		motionMock.prefersReducedMotion = true
		const { result } = renderHook(() => useAnimatedNumber(125, "total"))

		await waitFor(() => expect(result.current).toBe(125))
		expect(motionMock.animate).not.toHaveBeenCalled()
	})

	it("stops the active animation when unmounted", () => {
		const stop = vi.fn()
		motionMock.animate.mockReturnValue({ stop })
		const { unmount } = renderHook(() => useAnimatedNumber(125, "total"))

		act(() => unmount())

		expect(stop).toHaveBeenCalledTimes(1)
	})
})
