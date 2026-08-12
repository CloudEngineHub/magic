import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "../useTopicHistoryLayoutState"

const keyA = `${TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.topicPage}.test-a`
const keyB = `${TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.topicPage}.test-b`

/** Provides deterministic browser storage when the Node runtime disables jsdom localStorage. */
function createMemoryStorage(): Storage {
	const values = new Map<string, string>()
	return {
		get length() {
			return values.size
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, String(value)),
	}
}

describe("useTopicHistoryLayoutState", () => {
	beforeAll(() => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: createMemoryStorage(),
		})
	})

	beforeEach(() => {
		window.localStorage.clear()
	})

	afterEach(() => {
		window.localStorage.removeItem(keyA)
		window.localStorage.removeItem(keyB)
	})

	it("defaults to closed when storage is empty", () => {
		const { result } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: true }),
		)
		expect(result.current.isTopicHistoryPanelOpen).toBe(false)
	})

	it("restores open state from localStorage on mount", () => {
		window.localStorage.setItem(keyA, "true")
		const { result } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: true }),
		)
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
	})

	it("persists open and close to localStorage", () => {
		const { result } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: true }),
		)

		act(() => {
			result.current.openTopicHistoryPanel()
		})
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
		expect(window.localStorage.getItem(keyA)).toBe("true")

		act(() => {
			result.current.closeTopicHistoryPanel()
		})
		expect(result.current.isTopicHistoryPanelOpen).toBe(false)
		expect(window.localStorage.getItem(keyA)).toBe("false")
	})

	it("toggle writes storage", () => {
		const { result } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: true }),
		)

		act(() => {
			result.current.toggleTopicHistoryPanel()
		})
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
		expect(window.localStorage.getItem(keyA)).toBe("true")
	})

	it("isolates state by storage key", () => {
		window.localStorage.setItem(keyA, "true")
		window.localStorage.setItem(keyB, "false")

		const { result: a } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: true }),
		)
		const { result: b } = renderHook(() =>
			useTopicHistoryLayoutState({ storageKey: keyB, isEnabled: true }),
		)

		expect(a.current.isTopicHistoryPanelOpen).toBe(true)
		expect(b.current.isTopicHistoryPanelOpen).toBe(false)
	})

	it("when disabled, forces UI closed without clearing stored preference", () => {
		window.localStorage.setItem(keyA, "true")

		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: enabled }),
			{ initialProps: { enabled: true } },
		)

		expect(result.current.isTopicHistoryPanelOpen).toBe(true)

		rerender({ enabled: false })
		expect(result.current.isTopicHistoryPanelOpen).toBe(false)
		expect(window.localStorage.getItem(keyA)).toBe("true")

		act(() => {
			result.current.openTopicHistoryPanel()
		})
		expect(result.current.isTopicHistoryPanelOpen).toBe(false)

		rerender({ enabled: true })
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
	})

	it("does not write storage when closing while disabled", () => {
		window.localStorage.setItem(keyA, "true")

		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useTopicHistoryLayoutState({ storageKey: keyA, isEnabled: enabled }),
			{ initialProps: { enabled: false } },
		)

		expect(result.current.isTopicHistoryPanelOpen).toBe(false)
		expect(window.localStorage.getItem(keyA)).toBe("true")

		act(() => {
			result.current.closeTopicHistoryPanel()
		})
		expect(window.localStorage.getItem(keyA)).toBe("true")

		rerender({ enabled: true })
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
	})

	it("starts closed and avoids persistence for temporary Widget instances", () => {
		window.localStorage.setItem(keyA, "true")
		const { result } = renderHook(() =>
			useTopicHistoryLayoutState({
				storageKey: keyA,
				isEnabled: true,
				persistOpenState: false,
			}),
		)

		expect(result.current.isTopicHistoryPanelOpen).toBe(false)
		act(() => result.current.toggleTopicHistoryPanel())
		expect(result.current.isTopicHistoryPanelOpen).toBe(true)
		expect(window.localStorage.getItem(keyA)).toBe("true")
	})
})
