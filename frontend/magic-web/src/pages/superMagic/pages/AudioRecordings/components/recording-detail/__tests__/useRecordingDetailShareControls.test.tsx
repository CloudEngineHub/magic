import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useRecordingDetailShareControls } from "../useRecordingDetailShareControls"

const openShareManagementModalMock = vi.hoisted(() => vi.fn())
const storageMock = vi.hoisted(() => ({
	getItem: vi.fn(() => null),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	key: vi.fn(() => null),
	length: 0,
}))

vi.hoisted(() => {
	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

vi.mock("@/pages/superMagic/components/ShareManagement/openShareManagementModal", () => ({
	openShareManagementModal: openShareManagementModalMock,
}))

vi.mock("../../../utils/build-recording-share-selection", () => ({
	buildRecordingShareSelection: () => ({
		shareableFiles: [],
		defaultSelectedFileIds: [],
	}),
	collectRecordingRequiredShareFileIds: () => [],
}))

describe("useRecordingDetailShareControls", () => {
	it("opens a local recording share management dialog instead of the global share manager", () => {
		const { result } = renderHook(() =>
			useRecordingDetailShareControls({
				projectId: "project-demo-001",
				fileMap: null,
			}),
		)

		expect(result.current.shareManagementOpen).toBe(false)

		act(() => {
			result.current.openManageShare()
		})

		expect(result.current.shareManagementOpen).toBe(true)
		expect(openShareManagementModalMock).not.toHaveBeenCalled()

		act(() => {
			result.current.closeManageShare()
		})

		expect(result.current.shareManagementOpen).toBe(false)
	})
})
