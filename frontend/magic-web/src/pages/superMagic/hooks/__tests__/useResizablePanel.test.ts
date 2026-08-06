import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import useResizablePanel from "../useResizablePanel"

const STORAGE_KEY_LEFT = "MAGIC:test-resizable-left"
const STORAGE_KEY_RIGHT = "MAGIC:test-resizable-right"

/** Provides deterministic storage for resize persistence tests in jsdom. */
function createLocalStorageMock(): Storage {
	let store: Record<string, string> = {}
	return {
		get length() {
			return Object.keys(store).length
		},
		clear: vi.fn(() => {
			store = {}
		}),
		getItem: vi.fn((key: string) => store[key] ?? null),
		key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
		removeItem: vi.fn((key: string) => {
			delete store[key]
		}),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value
		}),
	}
}

describe("useResizablePanel", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", createLocalStorageMock())
		localStorage.clear()
	})

	afterEach(() => {
		cleanup()
		localStorage.clear()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it("should resize a left-growing panel with pointer events and persist width", () => {
		const { result, rerender } = renderHook(() =>
			useResizablePanel({
				minWidth: 100,
				maxWidth: 300,
				defaultWidth: 180,
				storageKey: STORAGE_KEY_LEFT,
				direction: "left",
			}),
		)

		act(() => {
			result.current.handleResizeStart(120)
		})
		rerender()

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 160 }))
			document.dispatchEvent(new MouseEvent("pointerup", { clientX: 160 }))
		})
		rerender()

		expect(result.current.width).toBe(220)
		expect(result.current.isDragging).toBe(false)
		expect(localStorage.getItem(STORAGE_KEY_LEFT)).toBe("220")
	})

	it("should resize a right-growing panel with pointer events", () => {
		const { result, rerender } = renderHook(() =>
			useResizablePanel({
				minWidth: 100,
				maxWidth: 300,
				defaultWidth: 180,
				storageKey: STORAGE_KEY_RIGHT,
				direction: "right",
			}),
		)

		act(() => {
			result.current.handleResizeStart(200)
		})
		rerender()

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }))
			document.dispatchEvent(new MouseEvent("pointerup", { clientX: 150 }))
		})
		rerender()

		expect(result.current.width).toBe(230)
		expect(localStorage.getItem(STORAGE_KEY_RIGHT)).toBe("230")
	})

	it("should stop dragging without persisting when pointer is cancelled", () => {
		const { result, rerender } = renderHook(() =>
			useResizablePanel({
				minWidth: 100,
				maxWidth: 300,
				defaultWidth: 180,
				storageKey: STORAGE_KEY_LEFT,
				direction: "left",
			}),
		)

		act(() => {
			result.current.handleResizeStart(120)
		})
		rerender()
		expect(result.current.isDragging).toBe(true)

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 160 }))
			document.dispatchEvent(new MouseEvent("pointercancel", { clientX: 160 }))
		})
		rerender()

		expect(result.current.isDragging).toBe(false)
		expect(result.current.width).toBe(220)
		expect(localStorage.getItem(STORAGE_KEY_LEFT)).toBeNull()
	})

	it("should clamp the current width when the maximum width decreases", () => {
		let maxWidth = 300
		const { result, rerender } = renderHook(() =>
			useResizablePanel({
				minWidth: 100,
				maxWidth,
				defaultWidth: 260,
				storageKey: STORAGE_KEY_RIGHT,
				direction: "right",
			}),
		)

		expect(result.current.width).toBe(260)

		maxWidth = 200
		rerender()

		expect(result.current.width).toBe(200)
	})

	it("should clean active pointer listeners when unmounted during a drag", () => {
		const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")
		const { result, rerender, unmount } = renderHook(() =>
			useResizablePanel({
				minWidth: 100,
				maxWidth: 300,
				defaultWidth: 180,
				storageKey: STORAGE_KEY_LEFT,
				direction: "left",
			}),
		)

		act(() => {
			result.current.handleResizeStart(120)
		})
		rerender()

		unmount()

		expect(removeEventListenerSpy).toHaveBeenCalledWith("pointermove", expect.any(Function))
		expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerup", expect.any(Function))
		expect(removeEventListenerSpy).toHaveBeenCalledWith("pointercancel", expect.any(Function))
		expect(localStorage.getItem(STORAGE_KEY_LEFT)).toBeNull()
	})
})
