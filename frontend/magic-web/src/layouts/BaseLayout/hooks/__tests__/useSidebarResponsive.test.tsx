import { act, renderHook } from "@testing-library/react"
import type { RefObject } from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resizablePanelStore, sidebarStore } from "@/stores/layout"
import useSidebarResponsive from "../useSidebarResponsive"

describe("useSidebarResponsive", () => {
	const originalInnerWidth = window.innerWidth

	beforeEach(() => {
		vi.useFakeTimers()
		localStorage.clear()
		resizablePanelStore.resetAllPanels()
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			writable: true,
			value: 1600,
		})
		sidebarStore.setCollapsed(false)
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
		resizablePanelStore.resetAllPanels()
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			writable: true,
			value: originalInnerWidth,
		})
	})

	function setupHook() {
		const initialWidth = sidebarStore.width
		let panelSize = initialWidth
		const panelHandle: ImperativePanelHandle = {
			collapse: vi.fn(),
			expand: vi.fn(),
			getId: vi.fn(() => "sidebar-panel"),
			getSize: vi.fn(() => panelSize),
			isCollapsed: vi.fn(() => sidebarStore.collapsed),
			isExpanded: vi.fn(() => !sidebarStore.collapsed),
			resize: vi.fn((size: number) => {
				panelSize = size
			}),
		}
		const sidebarPanelRef = { current: panelHandle } as RefObject<ImperativePanelHandle>

		return renderHook(() => useSidebarResponsive({ sidebarPanelRef, initialWidth }))
	}

	it("commits the final pointer-drag width before a following collapse", () => {
		const { result } = setupHook()

		act(() => {
			result.current.handleSidebarDragging(true)
			result.current.handleSidebarResize(30)
			result.current.handleSidebarDragging(false)
			sidebarStore.setCollapsed(true)
		})

		expect(sidebarStore.width).toBe(30)
	})

	it("ignores resize callbacks produced by programmatic sidebar animation", () => {
		const { result } = setupHook()
		const originalWidth = sidebarStore.width

		act(() => {
			result.current.handleSidebarResize(30)
			vi.advanceTimersByTime(100)
		})

		expect(sidebarStore.width).toBe(originalWidth)
	})

	it("keeps the latest keyboard width when collapse happens before the debounce", () => {
		const { result } = setupHook()

		act(() => {
			result.current.handleSidebarResizeKeyDown({ key: "ArrowRight" } as never)
			result.current.handleSidebarResize(30)
			result.current.handleSidebarResizeKeyDown({ key: "ArrowRight" } as never)
			result.current.handleSidebarResize(31)
			sidebarStore.setCollapsed(true)
			result.current.handleSidebarResize(sidebarStore.collapsedSizePercent)
			vi.advanceTimersByTime(100)
		})

		expect(sidebarStore.width).toBe(31)
	})
})
