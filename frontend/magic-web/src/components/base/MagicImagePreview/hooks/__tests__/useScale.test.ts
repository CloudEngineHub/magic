import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import useScale from "../useScale"

describe("useScale", () => {
	it("reports the fitted image size as a percentage of the original image", () => {
		const imageRef = { current: null }
		const { result } = renderHook(() =>
			useScale(imageRef, {
				fitScale: 0.25,
				maxScale: 10,
			}),
		)

		expect(result.current.scale).toBe(0.25)
		expect(result.current.transformScale).toBe(1)
	})

	it("converts 100% physical size to the required layout transform", () => {
		vi.useFakeTimers()
		const imageRef = { current: null }
		const { result } = renderHook(() =>
			useScale(imageRef, {
				fitScale: 0.25,
				maxScale: 10,
			}),
		)

		act(() => {
			result.current.setScale(1)
			vi.runAllTimers()
		})

		expect(result.current.scale).toBe(1)
		expect(result.current.transformScale).toBe(4)
		vi.useRealTimers()
	})

	it("returns to fit-to-viewport mode when reset", () => {
		vi.useFakeTimers()
		const imageRef = { current: null }
		const { result } = renderHook(() =>
			useScale(imageRef, {
				fitScale: 0.5,
				maxScale: 10,
			}),
		)

		act(() => {
			result.current.setScale(1)
			vi.runAllTimers()
		})
		act(() => {
			result.current.resetScale()
			vi.runAllTimers()
		})

		expect(result.current.scale).toBe(0.5)
		expect(result.current.transformScale).toBe(1)
		vi.useRealTimers()
	})
})
