import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY,
	useRecordingDetailConversationPanelState,
} from "../useRecordingDetailConversationPanelState"

describe("useRecordingDetailConversationPanelState", () => {
	beforeEach(() => {
		localStorage.clear()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		localStorage.clear()
	})

	it("defaults to collapsed when no preference is stored", () => {
		const { result } = renderHook(() => useRecordingDetailConversationPanelState())

		expect(result.current.isConversationPanelCollapsed).toBe(true)
	})

	it("restores the shared expanded preference", () => {
		localStorage.setItem(RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY, "false")

		const { result } = renderHook(() => useRecordingDetailConversationPanelState())

		expect(result.current.isConversationPanelCollapsed).toBe(false)
	})

	it("persists toggle changes for the recording-detail scene", () => {
		const { result } = renderHook(() => useRecordingDetailConversationPanelState())

		act(() => {
			result.current.toggleConversationPanel()
		})
		expect(result.current.isConversationPanelCollapsed).toBe(false)
		expect(
			localStorage.getItem(RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY),
		).toBe("false")

		act(() => {
			result.current.toggleConversationPanel()
		})
		expect(result.current.isConversationPanelCollapsed).toBe(true)
		expect(
			localStorage.getItem(RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY),
		).toBe("true")
	})

	it("keeps the UI usable when the stored value is invalid or storage fails", () => {
		localStorage.setItem(RECORDING_DETAIL_CONVERSATION_PANEL_COLLAPSED_STORAGE_KEY, "invalid")
		const invalidStored = renderHook(() => useRecordingDetailConversationPanelState())
		expect(invalidStored.result.current.isConversationPanelCollapsed).toBe(true)
		invalidStored.unmount()

		const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})
		const { result } = renderHook(() => useRecordingDetailConversationPanelState())
		expect(result.current.isConversationPanelCollapsed).toBe(true)
		getItemSpy.mockRestore()

		const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})
		act(() => {
			result.current.expandConversationPanel()
		})
		expect(result.current.isConversationPanelCollapsed).toBe(false)
		setItemSpy.mockRestore()
	})
})
