import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useMagicWidgetPreviewFullscreen } from "../useMagicWidgetPreviewFullscreen"

const MOCK_HOST_ORIGIN = "https://widget-host.example.invalid"
const MOCK_INSTANCE_ID = "widget-mock-fullscreen-hook"

describe("useMagicWidgetPreviewFullscreen", () => {
	let postMessage: ReturnType<typeof vi.fn>

	beforeEach(() => {
		postMessage = vi.fn()
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage } as unknown as Window,
		})
	})

	afterEach(() => {
		cleanup()
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: window,
		})
	})

	it("publishes deduplicated state snapshots and restores the host on unmount", () => {
		const { result, unmount } = renderHook(() =>
			useMagicWidgetPreviewFullscreen({
				instanceId: MOCK_INSTANCE_ID,
				hostOrigin: MOCK_HOST_ORIGIN,
			}),
		)

		act(() => {
			result.current(true)
			result.current(true)
		})

		expect(postMessage).toHaveBeenCalledTimes(1)
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "ui_state",
				instanceId: MOCK_INSTANCE_ID,
				state: { previewFullscreen: true },
			}),
			MOCK_HOST_ORIGIN,
		)

		unmount()
		expect(postMessage).toHaveBeenLastCalledWith(
			expect.objectContaining({ state: { previewFullscreen: false } }),
			MOCK_HOST_ORIGIN,
		)
	})

	it("does not publish outside an SDK iframe context", () => {
		const { result } = renderHook(() => useMagicWidgetPreviewFullscreen(null))

		act(() => result.current(true))

		expect(postMessage).not.toHaveBeenCalled()
	})
})
