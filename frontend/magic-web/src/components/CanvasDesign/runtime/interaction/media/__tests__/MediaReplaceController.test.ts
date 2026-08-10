import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ElementTypeEnum } from "../../../document/types"
import { MediaReplaceController } from "../MediaReplaceController"

describe("MediaReplaceController", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("routes a local video replacement with the captured Content", async () => {
		const states: string[] = []
		const replaceMediaElement = vi.fn(async () => true)
		vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)
		const container = document.createElement("div")
		const canvas = {
			container,
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn(
					(event: {
						type: string
						data: { elementId: string; mediaType?: string; status?: string }
					}) => {
						if (
							event.type === "element:media:replaceStateChanged" &&
							event.data.status
						) {
							states.push(event.data.status)
						}
					},
				),
			},
			canvasFileUploadManager: {
				replaceMediaElement,
				replaceMediaElementFromProject: vi.fn(),
			},
		} as unknown as Canvas
		const controller = new MediaReplaceController({ canvas })

		controller.openLocalFilePicker({
			elementId: "video-1",
			mediaType: ElementTypeEnum.Video,
			contentId: "video-content-1",
		})

		const input = container.querySelector("input") as HTMLInputElement
		expect(input.accept).toContain("video/*")
		expect(input.dataset.contentId).toBe("video-content-1")
		Object.defineProperty(input, "files", {
			configurable: true,
			value: [new File(["video"], "clip.mp4", { type: "video/mp4" })],
		})
		input.dispatchEvent(new Event("change"))
		await Promise.resolve()
		await Promise.resolve()

		expect(replaceMediaElement).toHaveBeenCalledWith({
			elementId: "video-1",
			mediaType: ElementTypeEnum.Video,
			contentId: "video-content-1",
			file: expect.any(File),
		})
		expect(states).toEqual(["uploading", "idle"])

		controller.destroy()
		expect(container.querySelector("input")).toBeNull()
	})

	it("routes a project image through the same replacement lifecycle", async () => {
		const replaceMediaElementFromProject = vi.fn(() => true)
		const canvas = {
			container: document.createElement("div"),
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: { emit: vi.fn() },
			canvasFileUploadManager: {
				replaceMediaElement: vi.fn(),
				replaceMediaElementFromProject,
			},
		} as unknown as Canvas
		const controller = new MediaReplaceController({ canvas })

		await expect(
			controller.replaceWithProjectFile({
				elementId: "image-1",
				mediaType: ElementTypeEnum.Image,
				contentId: "image-content-2",
				path: "/images/project.webp",
			}),
		).resolves.toBe(true)

		expect(replaceMediaElementFromProject).toHaveBeenCalledWith({
			elementId: "image-1",
			mediaType: ElementTypeEnum.Image,
			contentId: "image-content-2",
			path: "/images/project.webp",
		})
	})

	it("keeps the legacy audio element replacement state in sync", async () => {
		const states: string[] = []
		const canvas = {
			container: document.createElement("div"),
			readonly: false,
			t: vi.fn((_key: string, fallback: string) => fallback),
			eventEmitter: {
				emit: vi.fn((event: { type: string; data: { status?: string } }) => {
					if (event.type === "element:audio:replaceStateChanged" && event.data.status) {
						states.push(event.data.status)
					}
				}),
			},
			canvasFileUploadManager: {
				replaceMediaElement: vi.fn(),
				replaceMediaElementFromProject: vi.fn(() => true),
			},
		} as unknown as Canvas
		const controller = new MediaReplaceController({ canvas })

		await controller.replaceWithProjectFile({
			elementId: "audio-1",
			mediaType: ElementTypeEnum.Audio,
			contentId: "audio-content-1",
			path: "/audios/project.mp3",
		})

		expect(states).toEqual(["uploading", "idle"])
	})
})
