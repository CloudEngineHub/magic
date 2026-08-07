import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { VideoElement } from "../../../elements/video/VideoElement"
import { MediaPlaybackCoordinator } from "../MediaPlaybackCoordinator"

describe("MediaPlaybackCoordinator", () => {
	it("coordinates other media before fullscreen video playback starts", async () => {
		const preparePlayback = vi.fn()
		const fullscreenVideo = document.createElement("video")
		const handoff = vi.fn(() => ({ video: fullscreenVideo }))
		const acquire = vi.fn().mockResolvedValue({ video: fullscreenVideo })
		const element = Object.create(VideoElement.prototype) as unknown as {
			canvas: {
				mediaPlaybackCoordinator: { preparePlayback: typeof preparePlayback }
				videoPlaybackManager: {
					handoff: typeof handoff
					acquire: typeof acquire
				}
			}
			data: { id: string; src: string }
			syncPlaybackAttachment: ReturnType<typeof vi.fn>
			handoffPlaybackToFullscreen: () => HTMLVideoElement | null
			acquireFullscreenPlayback: () => Promise<HTMLVideoElement | null>
		}
		element.data = { id: "video-1", src: "./videos/a.mp4" }
		element.canvas = {
			mediaPlaybackCoordinator: { preparePlayback },
			videoPlaybackManager: { handoff, acquire },
		}
		element.syncPlaybackAttachment = vi.fn()

		expect(element.handoffPlaybackToFullscreen()).toBe(fullscreenVideo)
		expect(preparePlayback).toHaveBeenNthCalledWith(1, "video-1")
		expect(handoff).toHaveBeenCalledWith("video:inline:video-1", "video:fullscreen:video-1")

		expect(await element.acquireFullscreenPlayback()).toBe(fullscreenVideo)
		expect(preparePlayback).toHaveBeenNthCalledWith(2, "video-1")
		expect(acquire).toHaveBeenCalledWith("./videos/a.mp4", "video:fullscreen:video-1", {
			autoPlay: true,
		})
	})

	it("pauses other audio and video sessions before playback", () => {
		const pauseAllAudio = vi.fn()
		const firstPause = vi.fn()
		const secondPause = vi.fn()
		const firstVideo = Object.create(VideoElement.prototype) as VideoElement
		const secondVideo = Object.create(VideoElement.prototype) as VideoElement
		firstVideo.pausePreview = firstPause
		secondVideo.pausePreview = secondPause
		const canvas = {
			eventEmitter: { on: vi.fn(() => vi.fn()) },
			audioPlaybackManager: {
				pauseAll: pauseAllAudio,
				releaseAll: vi.fn(),
			},
			elementManager: {
				getAllElementIds: () => ["video-1", "video-2"],
				getElementInstance: (elementId: string) =>
					elementId === "video-1" ? firstVideo : secondVideo,
			},
		} as unknown as Canvas
		const coordinator = new MediaPlaybackCoordinator({ canvas })

		coordinator.preparePlayback("video-1")

		expect(pauseAllAudio).toHaveBeenCalledWith("video-1")
		expect(firstPause).not.toHaveBeenCalled()
		expect(secondPause).toHaveBeenCalledTimes(1)
	})

	it("pauses and releases media when the selection is cleared", () => {
		let handleDeselect!: () => void
		const unsubscribe = vi.fn()
		const pauseAllAudio = vi.fn()
		const releaseAllAudio = vi.fn()
		const canvas = {
			eventEmitter: {
				on: vi.fn((_eventName: string, handler: () => void) => {
					handleDeselect = handler
					return unsubscribe
				}),
			},
			audioPlaybackManager: {
				pauseAll: pauseAllAudio,
				releaseAll: releaseAllAudio,
			},
			elementManager: {
				getAllElementIds: () => [],
				getElementInstance: vi.fn(),
			},
		} as unknown as Canvas
		const coordinator = new MediaPlaybackCoordinator({ canvas })

		handleDeselect()

		expect(pauseAllAudio).toHaveBeenCalledWith(undefined)
		expect(releaseAllAudio).toHaveBeenCalledWith(undefined, { preserveMetadata: true })
		coordinator.destroy()
		expect(unsubscribe).toHaveBeenCalledTimes(1)
	})
})
