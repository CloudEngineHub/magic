import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAnimatedNumber, useAnimatedNumberPulse } from "../useAnimatedNumber"

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

	it("keeps loading empty and uses the first server value directly", async () => {
		const { result, rerender } = renderHook(
			({ value }: { value: number | undefined }) => useAnimatedNumber(value),
			{ initialProps: { value: undefined as number | undefined } },
		)
		expect(result.current).toBeUndefined()

		rerender({ value: 120 })

		await waitFor(() => expect(result.current).toBe(120))
		expect(motionMock.animate).not.toHaveBeenCalled()
	})

	it("animates subsequent polling updates from the current value", async () => {
		const { result, rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 } },
		)
		await waitFor(() => expect(result.current).toBe(100))

		rerender({ value: 130 })

		await waitFor(() => expect(result.current).toBe(130))
		expect(motionMock.animate).toHaveBeenCalledWith(
			100,
			130,
			expect.objectContaining({ duration: 1.1, ease: "easeOut" }),
		)
	})

	it("animates down when the latest server value is lower", async () => {
		const { rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 140 } },
		)

		rerender({ value: 125 })

		await waitFor(() => expect(motionMock.animate).toHaveBeenCalled())
		expect(motionMock.animate).toHaveBeenCalledWith(
			140,
			125,
			expect.objectContaining({ duration: 1.1 }),
		)
	})

	it("continues from the currently rendered value when a tween is interrupted", async () => {
		const firstStop = vi.fn()
		motionMock.animate.mockImplementationOnce(
			(_from: number, _to: number, options?: AnimateOptions) => {
				options?.onUpdate?.(115)
				return { stop: firstStop }
			},
		)
		const { rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 } },
		)

		rerender({ value: 130 })
		await waitFor(() => expect(motionMock.animate).toHaveBeenCalledTimes(1))
		rerender({ value: 140 })

		await waitFor(() => expect(motionMock.animate).toHaveBeenCalledTimes(2))
		expect(firstStop).toHaveBeenCalled()
		expect(motionMock.animate).toHaveBeenLastCalledWith(
			115,
			140,
			expect.objectContaining({ duration: 1.1 }),
		)
	})

	it("clears the rendered value when the server field becomes unavailable", async () => {
		const { result, rerender } = renderHook(
			({ value }: { value: number | undefined }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 as number | undefined } },
		)
		await waitFor(() => expect(result.current).toBe(100))

		rerender({ value: undefined })

		await waitFor(() => expect(result.current).toBeUndefined())
	})

	it("skips subsequent animation when reduced motion is enabled", async () => {
		motionMock.prefersReducedMotion = true
		const { result, rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 } },
		)

		rerender({ value: 125 })

		await waitFor(() => expect(result.current).toBe(125))
		expect(motionMock.animate).not.toHaveBeenCalled()
	})

	it("does not read or write browser storage", async () => {
		const getItemSpy = vi.spyOn(Storage.prototype, "getItem")
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem")
		const { rerender } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 } },
		)

		rerender({ value: 125 })
		await waitFor(() => expect(motionMock.animate).toHaveBeenCalled())

		expect(getItemSpy).not.toHaveBeenCalled()
		expect(setItemSpy).not.toHaveBeenCalled()
		getItemSpy.mockRestore()
		setItemSpy.mockRestore()
	})

	it("stops the active animation when unmounted", async () => {
		const stop = vi.fn()
		motionMock.animate.mockReturnValue({ stop })
		const { rerender, unmount } = renderHook(
			({ value }: { value: number }) => useAnimatedNumber(value),
			{ initialProps: { value: 100 } },
		)

		rerender({ value: 125 })
		await waitFor(() => expect(motionMock.animate).toHaveBeenCalled())
		act(() => unmount())

		expect(stop).toHaveBeenCalledTimes(1)
	})

	it("emphasizes subsequent changes without pulsing the first value", () => {
		vi.useFakeTimers()
		try {
			const { result, rerender } = renderHook(
				({ value }: { value: number }) => useAnimatedNumberPulse(value),
				{ initialProps: { value: 100 } },
			)
			expect(result.current).toBe(false)

			rerender({ value: 101 })
			expect(result.current).toBe(true)

			act(() => vi.advanceTimersByTime(1200))
			expect(result.current).toBe(false)
		} finally {
			vi.useRealTimers()
		}
	})
})
