import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	encodeCanvasToPngBlob,
	PNG_ENCODE_TIMEOUT_MS,
	SYNC_PNG_ENCODE_MAX_PIXELS,
	ScreenshotCancelledError,
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

	it("does not start encoding when already cancelled", async () => {
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

		await expect(encodeCanvasToPngBlob(canvas, () => true)).rejects.toBeInstanceOf(
			ScreenshotCancelledError,
		)
		expect(toBlob).not.toHaveBeenCalled()
		expect(toDataURL).not.toHaveBeenCalled()
	})

	it("does not fall back after cancel once the first toBlob times out", async () => {
		vi.useFakeTimers()
		const canvas = document.createElement("canvas")
		canvas.width = 1024
		canvas.height = 1024
		const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(() => {})
		const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: vi.fn(),
		} as never)
		const OffscreenCtor = vi.fn()
		globalThis.OffscreenCanvas = OffscreenCtor as never

		let aborted = false
		const pending = encodeCanvasToPngBlob(canvas, () => aborted)
		const cancelled = expect(pending).rejects.toBeInstanceOf(ScreenshotCancelledError)
		aborted = true
		await vi.advanceTimersByTimeAsync(PNG_ENCODE_TIMEOUT_MS)
		await cancelled
		expect(toBlob).toHaveBeenCalledTimes(1)
		expect(OffscreenCtor).not.toHaveBeenCalled()
		expect(toDataURL).not.toHaveBeenCalled()
	})

	it("does not scale and retry after cancel once Offscreen encoding finishes", async () => {
		vi.useFakeTimers()
		const canvas = document.createElement("canvas")
		canvas.width = 1024
		canvas.height = 1024
		const retriedBlob = new Blob(["retry"], { type: "image/png" })
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
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage: vi.fn(),
		} as never)
		class FakeOffscreen {
			constructor(
				public width: number,
				public height: number,
			) {}
			getContext() {
				return { drawImage: vi.fn() }
			}
			convertToBlob() {
				return new Promise<Blob>(() => {})
			}
		}
		globalThis.OffscreenCanvas = FakeOffscreen as never

		let aborted = false
		const pending = encodeCanvasToPngBlob(canvas, () => aborted)
		const cancelled = expect(pending).rejects.toBeInstanceOf(ScreenshotCancelledError)
		await vi.advanceTimersByTimeAsync(PNG_ENCODE_TIMEOUT_MS)
		aborted = true
		await vi.advanceTimersByTimeAsync(PNG_ENCODE_TIMEOUT_MS)
		await cancelled
		expect(toBlob).toHaveBeenCalledTimes(1)
		expect(toDataURL).not.toHaveBeenCalled()
	})
})
