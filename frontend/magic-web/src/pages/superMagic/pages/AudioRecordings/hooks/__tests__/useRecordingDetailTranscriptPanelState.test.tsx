import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY,
	useRecordingDetailTranscriptPanelState,
} from "../useRecordingDetailTranscriptPanelState"

describe("useRecordingDetailTranscriptPanelState", () => {
	beforeEach(() => {
		localStorage.clear()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		localStorage.clear()
	})

	it("defaults to expanded at the widest transcript width", () => {
		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		expect(result.current.isTranscriptPanelCollapsed).toBe(false)
		expect(result.current.transcriptPanelWidth).toBe(440)
	})

	it("restores a persisted collapsed state and width", () => {
		localStorage.setItem(
			RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY,
			JSON.stringify({ collapsed: true, width: 380 }),
		)

		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		expect(result.current.isTranscriptPanelCollapsed).toBe(true)
		expect(result.current.transcriptPanelWidth).toBe(380)
	})

	it("reads legacy boolean payloads without losing the default width", () => {
		localStorage.setItem(RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY, "true")

		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		expect(result.current.isTranscriptPanelCollapsed).toBe(true)
		expect(result.current.transcriptPanelWidth).toBe(440)
	})

	it("persists collapse and expand as a JSON payload", () => {
		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		act(() => {
			result.current.collapseTranscriptPanel()
		})
		expect(result.current.isTranscriptPanelCollapsed).toBe(true)
		expect(localStorage.getItem(RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY)).toBe(
			JSON.stringify({ collapsed: true, width: 440 }),
		)

		act(() => {
			result.current.expandTranscriptPanel()
		})
		expect(result.current.isTranscriptPanelCollapsed).toBe(false)
		expect(localStorage.getItem(RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY)).toBe(
			JSON.stringify({ collapsed: false, width: 440 }),
		)
	})

	it("persists a newly dragged width", () => {
		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		act(() => {
			result.current.setTranscriptPanelWidth(360)
		})
		expect(result.current.transcriptPanelWidth).toBe(360)
		expect(localStorage.getItem(RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY)).toBe(
			JSON.stringify({ collapsed: false, width: 360 }),
		)
	})

	it("clamps an out-of-range width into the readable band", () => {
		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())

		act(() => {
			result.current.setTranscriptPanelWidth(9999)
		})
		expect(result.current.transcriptPanelWidth).toBe(440)

		act(() => {
			result.current.setTranscriptPanelWidth(1)
		})
		expect(result.current.transcriptPanelWidth).toBe(300)
	})

	it("keeps the UI usable when the stored value is invalid or storage fails", () => {
		localStorage.setItem(RECORDING_DETAIL_TRANSCRIPT_PANEL_COLLAPSED_STORAGE_KEY, "invalid")
		const invalidStored = renderHook(() => useRecordingDetailTranscriptPanelState())
		expect(invalidStored.result.current.isTranscriptPanelCollapsed).toBe(false)
		expect(invalidStored.result.current.transcriptPanelWidth).toBe(440)
		invalidStored.unmount()

		const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})
		const { result } = renderHook(() => useRecordingDetailTranscriptPanelState())
		expect(result.current.isTranscriptPanelCollapsed).toBe(false)
		getItemSpy.mockRestore()

		const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})
		act(() => {
			result.current.collapseTranscriptPanel()
		})
		expect(result.current.isTranscriptPanelCollapsed).toBe(true)
		setItemSpy.mockRestore()
	})
})
