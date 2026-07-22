import { describe, expect, it } from "vitest"
import type { FrameElement, ImageElement, VideoElement } from "../../document/types"
import { ImageGenerationTaskTypeMap } from "../../../public/magic-types"
import {
	collectElementResourceReferences,
	rewriteElementResourceReferences,
} from "../clipboard/clipboardResourceReferences"

describe("clipboardResourceReferences", () => {
	it("collects resource references recursively and skips remote paths", () => {
		const image: ImageElement = {
			id: "image-1",
			type: "image",
			src: "./images/visible.png",
			generateImageRequest: {
				prompt: "plain text source/ref.png should not matter",
				reference_images: ["source/ref.png", "https://example.test/remote.png"],
				reference_image_options: [{ path: "source/ref.png" }],
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.Eraser,
				file_path: "images/visible.png",
				mask_path: "source/mask.png",
				mark_path: "data:image/png;base64,aaaa",
			},
		}
		const video: VideoElement = {
			id: "video-1",
			type: "video",
			src: "source/video.mp4",
			generateVideoRequest: {
				inputs: {
					frames: [{ role: "start", uri: "source/start.png" }],
					reference_videos: [{ uri: "source/ref.mp4" }],
					reference_audios: [{ uri: "blob:https://example.test/audio" }],
					video: { uri: "source/video.mp4" },
				},
			},
		}
		const frame: FrameElement = {
			id: "frame-1",
			type: "frame",
			children: [image, video],
		}

		expect(
			collectElementResourceReferences([frame]).map((ref) => ({
				path: ref.path,
				isSelfReferenceOnly: ref.isSelfReferenceOnly,
			})),
		).toEqual([
			{ path: "source/ref.png", isSelfReferenceOnly: false },
			{ path: "images/visible.png", isSelfReferenceOnly: true },
			{ path: "source/mask.png", isSelfReferenceOnly: false },
			{ path: "source/start.png", isSelfReferenceOnly: false },
			{ path: "source/ref.mp4", isSelfReferenceOnly: false },
			{ path: "source/video.mp4", isSelfReferenceOnly: true },
		])
	})

	it("rewrites only schema resource fields", () => {
		const image: ImageElement = {
			id: "image-1",
			type: "image",
			generateImageRequest: {
				project_id: "source-project",
				file_dir: "/source/images/",
				prompt: "keep source/ref.png in prompt text",
				reference_images: ["source/ref.png"],
				reference_image_options: [{ path: "source/ref.png" }],
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.Expand,
				file_path: "source/base.png",
				canvas_path: "source/canvas.png",
			},
		}

		const changed = rewriteElementResourceReferences(
			image,
			new Map([
				["source/ref.png", "target/ref.png"],
				["source/base.png", "target/base.png"],
				["source/canvas.png", "target/canvas.png"],
			]),
		)

		expect(changed).toBe(true)
		expect(image.generateImageRequest?.prompt).toBe("keep source/ref.png in prompt text")
		expect(image.generateImageRequest?.reference_images).toEqual(["target/ref.png"])
		expect(image.generateImageRequest?.reference_image_options).toEqual([
			expect.objectContaining({ path: "target/ref.png" }),
		])
		expect(image.generateImageRequest?.project_id).toBeUndefined()
		expect(image.generateImageRequest?.file_dir).toBeUndefined()
		expect(image.imageGenerationTaskMeta).toEqual(
			expect.objectContaining({
				file_path: "target/base.png",
				canvas_path: "target/canvas.png",
			}),
		)
	})
})
