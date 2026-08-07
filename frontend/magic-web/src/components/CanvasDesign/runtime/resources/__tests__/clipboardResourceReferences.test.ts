import { describe, expect, it } from "vitest"
import type { FrameElement, ImageElement, ImageElementV2, VideoElement } from "../../document/types"
import { ImageGenerationTaskTypeMap } from "../../../public/magic-types"
import {
	addClipboardResourceAliasMappings,
	collectElementResourceReferences,
	rewriteElementResourceReferences,
} from "../clipboard/clipboardResourceReferences"
import { createTestResourceReferenceResolver } from "../../../public/__tests__/testResourceReferenceResolver"

describe("clipboardResourceReferences", () => {
	it("collects and rewrites resources from every V2 image version", () => {
		const image: ImageElementV2 = {
			id: "image-v2",
			type: "image",
			imageDslVersion: 2,
			activeVersionId: "v2",
			mainVersionId: "v1",
			versions: [
				{
					id: "v1",
					src: "./images/one.png",
					generateImageRequest: { reference_images: ["./images/ref-one.png"] },
				},
				{
					id: "v2",
					src: "./images/two.png",
					imageGenerationTaskMeta: {
						type: ImageGenerationTaskTypeMap.High,
						file_path: "./images/base-two.png",
					},
				},
			],
		}

		expect(collectElementResourceReferences([image]).map((ref) => ref.path)).toEqual([
			"./images/one.png",
			"./images/ref-one.png",
			"./images/two.png",
			"./images/base-two.png",
		])

		rewriteElementResourceReferences(
			image,
			new Map([
				["./images/one.png", "./images/copied-one.png"],
				["./images/ref-one.png", "./images/copied-ref-one.png"],
				["./images/two.png", "./images/copied-two.png"],
				["./images/base-two.png", "./images/copied-base-two.png"],
			]),
		)

		expect(image.versions).toEqual([
			expect.objectContaining({
				id: "v1",
				src: "./images/copied-one.png",
				generateImageRequest: expect.objectContaining({
					reference_images: ["./images/copied-ref-one.png"],
				}),
			}),
			expect.objectContaining({
				id: "v2",
				src: "./images/copied-two.png",
				imageGenerationTaskMeta: expect.objectContaining({
					file_path: "./images/copied-base-two.png",
				}),
			}),
		])
		expect(image.activeVersionId).toBe("v2")
		expect(image.mainVersionId).toBe("v1")
	})

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
				file_path: "./images/visible.png",
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
			{ path: "./images/visible.png", isSelfReferenceOnly: true },
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
				mask_path: "source/mask.png",
				mark_path: "source/mark.png",
			},
		}

		const changed = rewriteElementResourceReferences(
			image,
			new Map([
				["source/ref.png", "target/ref.png"],
				["source/base.png", "target/base.png"],
				["source/canvas.png", "target/canvas.png"],
				["source/mask.png", "target/mask.png"],
				["source/mark.png", "target/mark.png"],
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
				canvas_path: "source/canvas.png",
				mask_path: "source/mask.png",
				mark_path: "source/mark.png",
			}),
		)
	})

	it("dedupes and rewrites aliases without crossing workspace roots", () => {
		const resolveResourceReference = createTestResourceReferenceResolver()
		const image: ImageElement = {
			id: "image-1",
			type: "image",
			src: "./images/owner.png",
			generateImageRequest: {
				reference_images: ["./images/x.png", "/画布A/images/x.png", "/images/x.png"],
			},
		}

		expect(collectElementResourceReferences([image], resolveResourceReference)).toEqual([
			{
				path: "./images/x.png",
				identity: "workspace:/画布A/images/x.png",
				aliases: ["./images/x.png", "/画布A/images/x.png"],
				isSelfReferenceOnly: false,
			},
			{
				path: "/images/x.png",
				identity: "workspace:/images/x.png",
				aliases: ["/images/x.png"],
				isSelfReferenceOnly: false,
			},
		])

		rewriteElementResourceReferences(
			image,
			new Map([["./images/x.png", "./images/copied.png"]]),
			resolveResourceReference,
		)

		expect(image.generateImageRequest?.reference_images).toEqual([
			"./images/copied.png",
			"./images/copied.png",
			"/images/x.png",
		])
	})

	it("rewrites source-canvas aliases without interpreting them through the target resolver", () => {
		const sourceResolver = createTestResourceReferenceResolver({
			currentCanvasWorkspacePath: "/画布A",
		})
		const targetResolver = createTestResourceReferenceResolver({
			currentCanvasWorkspacePath: "/画布B",
		})
		const image: ImageElement = {
			id: "image-1",
			type: "image",
			generateImageRequest: {
				reference_images: ["./images/x.png", "/画布A/images/x.png"],
			},
		}
		const [reference] = collectElementResourceReferences([image], sourceResolver)
		const pathMap = new Map<string, string>()
		addClipboardResourceAliasMappings(
			pathMap,
			reference.path,
			reference.aliases,
			"./images/copied.png",
		)

		rewriteElementResourceReferences(image, pathMap, targetResolver)

		expect(image.generateImageRequest?.reference_images).toEqual([
			"./images/copied.png",
			"./images/copied.png",
		])
	})
})
