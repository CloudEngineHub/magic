import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	encodeCanvasToPngBlob,
	PNG_ENCODE_TIMEOUT_MS,
	SYNC_PNG_ENCODE_MAX_PIXELS,
} from "../inspectorScreenshot"

describe("encodeCanvasToPngBlob", () => {
	const previousOffscreenCanvas = globalThis.OffscreenCanvas

	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
		if (previousOffscreenCanvas) {
			globalThis.OffscreenCanvas = previousOffscreenCanvas
		} else {
			Reflect.deleteProperty(globalThis, "OffscreenCanvas")
		}
	})

	beforeEach(() => {
		Reflect.deleteProperty(globalThis, "OffscreenCanvas")
	})

	it("encodes with async toBlob instead of toDataURL", async () => {
		const canvas = document.createElement("canvas")
		canvas.width = 80
		canvas.height = 60
		const blob = new Blob(["png"], { type: "image/png" })
		const toBlob = vi
			.spyOn(HTMLCanvasElement.prototype, "toBlob")
			.mockImplementation((callback) => {
				callback(blob)
			})
		const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")

		await expect(encodeCanvasToPngBlob(canvas)).resolves.toBe(blob)
		expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png")
		expect(toDataURL).not.toHaveBeenCalled()
	})

	it("retries a smaller canvas when toBlob stalls on a large screenshot", async () => {
		vi.useFakeTimers()
		const canvas = document.createElement("canvas")
		canvas.width = 1024
		canvas.height = 1024
		expect(canvas.width * canvas.height).toBeGreaterThan(SYNC_PNG_ENCODE_MAX_PIXELS)

		const retriedBlob = new Blob(["retry"], { type: "image/png" })
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: vi.fn(),
		} as never)
		const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
			this: HTMLCanvasElement,
			callback,
		) {
			if (this.width < 1024) {
				callback(retriedBlob)
				return
			}
		})
		const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")

		const pending = encodeCanvasToPngBlob(canvas)
		await vi.advanceTimersByTimeAsync(PNG_ENCODE_TIMEOUT_MS)
		await expect(pending).resolves.toBe(retriedBlob)
		expect(toBlob.mock.calls.length).toBeGreaterThan(1)
		expect(toDataURL).not.toHaveBeenCalled()
	})
})
