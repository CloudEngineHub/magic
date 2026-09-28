import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HTML_PREVIEW_READY_TIMEOUT, useHtmlPreviewFreshness } from "../useHtmlPreviewFreshness"

describe("HTML preview freshness", () => {
	it("keeps background checks quiet but times out an actual render", () => {
		const { result } = renderHook(() => useHtmlPreviewFreshness("file-a"))
		let request = 0
		act(() => {
			request = result.current.begin(false)
		})
		act(() => vi.advanceTimersByTime(HTML_PREVIEW_READY_TIMEOUT))
		expect(result.current.phase).toBe("idle")
		act(() => result.current.rendering(request))
		act(() => vi.advanceTimersByTime(HTML_PREVIEW_READY_TIMEOUT))
		expect(result.current.phase).toBe("failed")
	})
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())
	it("keeps later work pending when an earlier refresh succeeds or fails", () => {
		const { result } = renderHook(() => useHtmlPreviewFreshness("file-a"))
		let previous = 0
		let current = 0
		act(() => {
			previous = result.current.begin()
			current = result.current.begin()
		})
		act(() => {
			result.current.ready(previous)
			result.current.fail(previous)
		})
		expect(result.current.phase).toBe("updating")
		act(() => result.current.rendering(current))
		expect(result.current.phase).toBe("rendering")
		act(() => result.current.ready(current))
		expect(result.current.phase).toBe("idle")
		expect(result.current.hasRendered).toBe(true)
	})
	it("reports an unacknowledged preview and accepts a late acknowledgement", () => {
		const { result } = renderHook(() => useHtmlPreviewFreshness("file-a"))
		let request = 0
		act(() => {
			request = result.current.begin()
			result.current.rendering(request)
		})
		act(() => vi.advanceTimersByTime(HTML_PREVIEW_READY_TIMEOUT))
		expect(result.current.phase).toBe("failed")
		expect(result.current.hasRendered).toBe(false)
		act(() => result.current.ready(request))
		expect(result.current.phase).toBe("idle")
	})
	it("allows retry without forgetting the last working preview", () => {
		const { result } = renderHook(() => useHtmlPreviewFreshness("file-a"))
		act(() => {
			const request = result.current.begin()
			result.current.ready(request)
		})
		act(() => {
			const request = result.current.begin()
			result.current.fail(request)
		})
		expect(result.current.hasRendered).toBe(true)
		expect(result.current.phase).toBe("failed")
		act(() => result.current.begin())
		expect(result.current.phase).toBe("updating")
	})
	it("invalidates pending work on file switches and unmount", () => {
		const { result, rerender, unmount } = renderHook(
			({ file }) => useHtmlPreviewFreshness(file),
			{ initialProps: { file: "a" } },
		)
		let request = 0
		act(() => {
			request = result.current.begin()
		})
		rerender({ file: "b" })
		expect(result.current.isCurrent(request)).toBe(false)
		expect(result.current.phase).toBe("idle")
		act(() => {
			request = result.current.begin()
		})
		unmount()
		expect(result.current.isCurrent(request)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})
})
