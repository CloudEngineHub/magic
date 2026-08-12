import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useTopicDesktopLayout } from "../useTopicDesktopLayout"
import {
	DEFAULT_WIDTH,
	MESSAGE_PANEL_WIDTH_STORAGE_KEY,
	PROJECT_SIDER_WIDTH_STORAGE_KEY,
} from "../../../../constants/resizablePanel"

class MockResizeObserver {
	observe = vi.fn()
	disconnect = vi.fn()

	constructor(callback: ResizeObserverCallback) {
		void callback
	}
}

/** Provides deterministic storage for layout persistence tests in jsdom. */
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

describe("useTopicDesktopLayout", () => {
	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver)
		vi.stubGlobal("localStorage", createLocalStorageMock())
		localStorage.clear()
	})

	afterEach(() => {
		cleanup()
		pubsub.clear()
		localStorage.clear()
		vi.unstubAllGlobals()
	})

	it("should return default widths", () => {
		const { result } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		expect(result.current.projectSiderWidthPx).toBe(DEFAULT_WIDTH.PROJECT_SIDER)
		expect(result.current.messagePanelWidthPx).toBe(DEFAULT_WIDTH.MESSAGE_PANEL)
		expect(result.current.isConversationPanelCollapsed).toBe(false)
	})

	it("should resize project sider and persist width", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.startDragProjectSider(100)
		})
		rerender()

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }))
			document.dispatchEvent(new MouseEvent("pointerup", { clientX: 150 }))
		})
		rerender()

		expect(result.current.projectSiderWidthPx).toBe(DEFAULT_WIDTH.PROJECT_SIDER + 50)
		expect(localStorage.getItem(PROJECT_SIDER_WIDTH_STORAGE_KEY)).toBe(
			String(DEFAULT_WIDTH.PROJECT_SIDER + 50),
		)
	})

	it("should resize message panel with pointer events", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.startDragMessagePanel(300)
		})
		rerender()

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 260 }))
			document.dispatchEvent(new MouseEvent("pointerup", { clientX: 260 }))
		})
		rerender()

		expect(result.current.messagePanelWidthPx).toBe(DEFAULT_WIDTH.MESSAGE_PANEL + 40)
		expect(localStorage.getItem(MESSAGE_PANEL_WIDTH_STORAGE_KEY)).toBe(
			String(DEFAULT_WIDTH.MESSAGE_PANEL + 40),
		)
	})

	it("should end drag state without persisting when pointer is cancelled", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.startDragProjectSider(100)
		})
		rerender()
		expect(result.current.isDraggingProjectSider).toBe(true)

		act(() => {
			document.dispatchEvent(new MouseEvent("pointermove", { clientX: 150 }))
			document.dispatchEvent(new MouseEvent("pointercancel", { clientX: 100 }))
		})
		rerender()

		expect(result.current.isDraggingProjectSider).toBe(false)
		expect(localStorage.getItem(PROJECT_SIDER_WIDTH_STORAGE_KEY)).toBeNull()
	})

	it("should toggle conversation panel collapse state", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.toggleConversationPanel()
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(true)

		act(() => {
			result.current.toggleConversationPanel()
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(false)
	})

	it("should expand collapsed panel when detail panel becomes visible", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.toggleConversationPanel()
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(true)

		act(() => {
			result.current.ensureExpandedWhenDetailVisible(true)
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(false)
	})

	it("should expand collapsed conversation panel when requested globally", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			result.current.toggleConversationPanel()
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(true)

		act(() => {
			pubsub.publish(PubSubEvents.Expand_Topic_Conversation_Panel)
		})
		rerender()
		expect(result.current.isConversationPanelCollapsed).toBe(false)
	})

	it("should collapse expanded conversation panel when requested globally", () => {
		const { result, rerender } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		act(() => {
			pubsub.publish(PubSubEvents.Collapse_Topic_Conversation_Panel)
		})
		rerender()

		expect(result.current.isConversationPanelCollapsed).toBe(true)
	})

	it("should ignore message panel percentage values from storage", () => {
		localStorage.setItem(MESSAGE_PANEL_WIDTH_STORAGE_KEY, "60")

		const { result } = renderHook(() => useTopicDesktopLayout({ isReadOnly: false }))

		expect(result.current.messagePanelWidthPx).toBe(DEFAULT_WIDTH.MESSAGE_PANEL)
	})

	it("should start expanded and avoid persisting collapse state for embedded layouts", () => {
		localStorage.setItem(
			"supermagic-topic-conversation-panel",
			JSON.stringify({ collapsed: true, lastExpandedSize: 420 }),
		)
		vi.mocked(localStorage.setItem).mockClear()

		const { result, rerender } = renderHook(() =>
			useTopicDesktopLayout({
				isReadOnly: false,
				persistConversationPanelState: false,
			}),
		)

		expect(result.current.isConversationPanelCollapsed).toBe(false)

		act(() => {
			result.current.toggleConversationPanel()
		})
		rerender()

		expect(result.current.isConversationPanelCollapsed).toBe(true)
		expect(localStorage.setItem).not.toHaveBeenCalledWith(
			"supermagic-topic-conversation-panel",
			expect.any(String),
		)
	})
})
