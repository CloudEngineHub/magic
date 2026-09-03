import { describe, expect, it, vi } from "vitest"
import { ImageElement } from "../../image/ImageElement"
import { VideoElement } from "../../video/VideoElement"
import {
	ElementTypeEnum,
	type ImageElement as ImageElementData,
	type VideoElement as VideoElementData,
} from "../../../document/types"

function createPreviewCanvas(previewContentId: string) {
	return {
		getElementForContentView: vi.fn((element: ImageElementData | VideoElementData) => ({
			...element,
			activeContentId: previewContentId,
		})),
		getEffectiveContentId: vi.fn(() => previewContentId),
		markerManager: { handleImageContentChanged: vi.fn() },
		generationRuntimeManager: { hasActiveGeneration: vi.fn(() => false) },
	} as never
}

describe("media element updates with session Content previews", () => {
	it("keeps the image view on the preview Content when the document active Content changes", () => {
		const data: ImageElementData = {
			id: "image-1",
			type: ElementTypeEnum.Image,
			activeContentId: "image-content-1",
			mainContentId: "image-content-1",
			contents: [
				{ contentId: "image-content-1", src: "/images/one.png" },
				{ contentId: "image-content-2", src: "/images/two.png" },
				{ contentId: "image-content-3", src: "/images/three.png" },
			],
		}
		const nextData = { ...data, activeContentId: "image-content-3" }
		const element = Object.create(ImageElement.prototype) as ImageElement
		Object.assign(element, { data, canvas: createPreviewCanvas("image-content-2") })

		const rerender = element.update(nextData)

		expect(rerender).toBe(false)
		expect(element.getData().activeContentId).toBe("image-content-3")
		expect(element.getActiveContentData().contentId).toBe("image-content-2")
		expect(element.getActiveContentData().src).toBe("/images/two.png")
		expect(element.canvas.markerManager.handleImageContentChanged).toHaveBeenCalledWith(
			"image-1",
			"image-content-1",
			"image-content-3",
		)
	})

	it("keeps the video view on the preview Content when the document active Content changes", () => {
		const data: VideoElementData = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			activeContentId: "video-content-1",
			mainContentId: "video-content-1",
			contents: [
				{ contentId: "video-content-1", src: "/videos/one.mp4" },
				{ contentId: "video-content-2", src: "/videos/two.mp4" },
				{ contentId: "video-content-3", src: "/videos/three.mp4" },
			],
		}
		const nextData = { ...data, activeContentId: "video-content-3" }
		const element = Object.create(VideoElement.prototype) as VideoElement
		Object.assign(element, { data, canvas: createPreviewCanvas("video-content-2") })

		const rerender = element.update(nextData)

		expect(rerender).toBe(false)
		expect(element.getData().activeContentId).toBe("video-content-3")
		expect(
			(
				element as unknown as { getVideoContent: () => { contentId: string; src?: string } }
			).getVideoContent(),
		).toMatchObject({ contentId: "video-content-2", src: "/videos/two.mp4" })
	})
})
