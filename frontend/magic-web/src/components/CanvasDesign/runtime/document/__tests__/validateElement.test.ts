import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "../types"
import { isValidElementData } from "../validateElement"

function contentElement(
	type: string,
	content: Record<string, unknown>,
	extra: Record<string, unknown> = {},
) {
	const contentId = `${type}-content-1`
	return {
		id: `${type}-1`,
		type,
		activeContentId: contentId,
		mainContentId: contentId,
		contents: [{ contentId, ...content }],
		...extra,
	}
}

describe("isValidElementData", () => {
	const validImage = contentElement(ElementTypeEnum.Image, {
		src: "./images/one.png",
		status: "completed",
	})

	it("accepts v3 contents with valid unique pointers", () => {
		expect(isValidElementData(validImage)).toBe(true)
		expect(
			isValidElementData({
				id: "image-empty",
				type: ElementTypeEnum.Image,
				activeContentId: null,
				mainContentId: null,
				contents: [],
			}),
		).toBe(true)
	})

	it("rejects invalid pointers, duplicate IDs, and Element-level business fields", () => {
		expect(isValidElementData({ ...validImage, activeContentId: "missing" })).toBe(false)
		expect(isValidElementData({ ...validImage, mainContentId: null })).toBe(false)
		expect(
			isValidElementData({
				...validImage,
				contents: [...validImage.contents, { ...validImage.contents[0] }],
			}),
		).toBe(false)
		expect(isValidElementData({ ...validImage, src: "./images/stale.png" })).toBe(false)
		expect(
			isValidElementData({
				...validImage,
				contents: [{ ...validImage.contents[0], id: "legacy" }],
			}),
		).toBe(false)
	})

	it("validates audio Content", () => {
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.Audio, { src: "./audios/voice.mp3" }),
			),
		).toBe(true)
		expect(isValidElementData(contentElement(ElementTypeEnum.Audio, { src: 123 }))).toBe(false)
	})

	it("validates storyboard shots and stable output associations", () => {
		const content = {
			generationConfig: { model_id: "gpt-image-2", size: "1080x1920" },
			shots: [{ id: "shot-1", durationSeconds: 4, description: "森林小路" }],
		}
		expect(isValidElementData(contentElement(ElementTypeEnum.Storyboard, content))).toBe(true)
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.Storyboard, {
					shots: [{ id: "shot-1", durationSeconds: 0, description: "森林小路" }],
				}),
			),
		).toBe(false)
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.Storyboard, {
					shots: [
						{
							id: "shot-1",
							durationSeconds: 3,
							description: "镜头一",
							outputImageElementId: "image-output",
						},
						{
							id: "shot-2",
							durationSeconds: 3,
							description: "镜头二",
							outputImageElementId: "image-output",
						},
					],
				}),
			),
		).toBe(false)
	})

	it("validates video-edit sequences and output settings", () => {
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.VideoEdit, {
					videoSequence: ["video-s01", "video-s02"],
					audioSequence: ["audio-narration"],
					output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
				}),
			),
		).toBe(true)
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.VideoEdit, {
					videoSequence: ["video-s01", "video-s01"],
					audioSequence: [],
				}),
			),
		).toBe(false)
		expect(
			isValidElementData(
				contentElement(ElementTypeEnum.VideoEdit, {
					videoSequence: [],
					audioSequence: [],
					output: { resolution: 1024 },
				}),
			),
		).toBe(false)
	})
})
