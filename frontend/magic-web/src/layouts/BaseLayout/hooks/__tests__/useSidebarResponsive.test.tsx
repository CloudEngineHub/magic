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

	it("persists the user width when the sidebar collapses before the resize debounce", () => {
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

		const { result } = renderHook(() => useSidebarResponsive({ sidebarPanelRef, initialWidth }))

		act(() => {
			result.current.handleSidebarResize(30)
			sidebarStore.setCollapsed(true)
			panelSize = sidebarStore.collapsedSizePercent
			vi.advanceTimersByTime(100)
		})

		expect(sidebarStore.width).toBe(30)
	})
})
