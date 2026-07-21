import { describe, expect, it, vi } from "vitest"
import { VideoPreviewLoader } from "../video/VideoPreviewLoader"

function createLoader(options?: { isDestroyed?: () => boolean }) {
	const onAbort = vi.fn()
	const loader = new VideoPreviewLoader({
		timeoutMs: 1000,
		isDestroyed: options?.isDestroyed ?? (() => false),
		onStaleRequestDrop: vi.fn(),
		onAbort,
		onTimeout: vi.fn(),
	})
	return { loader, onAbort }
}

describe("VideoPreviewLoader", () => {
	it("aborts an in-flight preview when its scheduler signal is cancelled", async () => {
		const { loader, onAbort } = createLoader()
		const controller = new AbortController()
		const video = document.createElement("video")
		vi.spyOn(video, "load").mockImplementation(() => undefined)
		vi.spyOn(video, "pause").mockImplementation(() => undefined)
		const createElement = vi.spyOn(document, "createElement").mockReturnValue(video)

		const preview = loader.extractPreviewResource(
			"https://example.test/video.mp4",
			undefined,
			controller.signal,
		)
		controller.abort()

		await expect(preview).resolves.toBeNull()
		expect(onAbort).toHaveBeenCalledTimes(1)
		expect(video.pause).toHaveBeenCalledTimes(1)
		createElement.mockRestore()
	})
})
