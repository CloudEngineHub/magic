import { act, renderHook } from "@testing-library/react"
import type { RefObject } from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sidebarStore } from "@/stores/layout"
import useSidebarAnimation from "../useSidebarAnimation"

describe("useSidebarAnimation", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		sidebarStore.setCollapsed(true)
	})

	afterEach(() => {
		sidebarStore.setCollapsed(false)
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
	})

	it("restores the expanded width even when animation frames are throttled", () => {
		let panelSize = sidebarStore.collapsedSizePercent
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

		vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1)
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

		renderHook(() =>
			useSidebarAnimation({
				sidebarPanelRef,
				getExpandedSidebarSizePercent: () => 30,
			}),
		)

		act(() => {
			sidebarStore.setCollapsed(false)
			vi.advanceTimersByTime(200)
		})

		expect(panelHandle.resize).toHaveBeenLastCalledWith(30)
		expect(panelSize).toBe(30)
	})

	it("ignores callbacks left behind by a superseded animation", () => {
		let panelSize = sidebarStore.collapsedSizePercent
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
		const animationCallbacks = new Map<number, FrameRequestCallback>()
		let animationFrameId = 0

		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			animationFrameId += 1
			animationCallbacks.set(animationFrameId, callback)
			return animationFrameId
		})
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)

		renderHook(() =>
			useSidebarAnimation({
				sidebarPanelRef,
				getExpandedSidebarSizePercent: () => 30,
			}),
		)

		act(() => {
			sidebarStore.setCollapsed(false)
			animationCallbacks.get(1)?.(10)
			animationCallbacks.get(2)?.(60)
		})

		const staleCallback = animationCallbacks.get(3)
		expect(staleCallback).toBeTypeOf("function")

		act(() => {
			sidebarStore.setCollapsed(true)
		})

		const resizeCallCount = vi.mocked(panelHandle.resize).mock.calls.length

		act(() => {
			staleCallback?.(100)
		})

		expect(panelHandle.resize).toHaveBeenCalledTimes(resizeCallCount)
	})
})
