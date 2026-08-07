import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "../types"
import { isValidElementData } from "../validateElement"

describe("isValidElementData", () => {
	const validV2Image = {
		id: "image-v2",
		type: ElementTypeEnum.Image,
		imageDslVersion: 2,
		activeVersionId: "v1",
		mainVersionId: "v1",
		versions: [{ id: "v1", src: "./images/one.png", status: "completed" }],
	}

	it("accepts a V2 image with unique versions and valid active/main pointers", () => {
		expect(isValidElementData(validV2Image)).toBe(true)
	})

	it("rejects legacy runtime accessors on V2 images", () => {
		const runtimeImage = { ...validV2Image }
		Object.defineProperty(runtimeImage, "src", {
			enumerable: false,
			get: () => runtimeImage.versions[0]?.src,
		})
		expect(isValidElementData(runtimeImage)).toBe(false)
	})

	it("rejects invalid V2 pointers, duplicate ids, and mixed V1/V2 fields", () => {
		expect(isValidElementData({ ...validV2Image, activeVersionId: "missing" })).toBe(false)
		expect(
			isValidElementData({
				...validV2Image,
				versions: [...validV2Image.versions, { ...validV2Image.versions[0] }],
			}),
		).toBe(false)
		expect(isValidElementData({ ...validV2Image, src: "./images/stale.png" })).toBe(false)
		expect(isValidElementData({ ...validV2Image, imageDslVersion: 3 })).toBe(false)
	})

	it("accepts an audio element with an optional string src", () => {
		expect(
			isValidElementData({
				id: "audio-1",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 480,
				height: 120,
				src: "./audios/voice.mp3",
			}),
		).toBe(true)
		expect(
			isValidElementData({
				id: "audio-2",
				type: ElementTypeEnum.Audio,
				x: 0,
				y: 0,
				width: 480,
				height: 120,
			}),
		).toBe(true)
	})

	it("rejects an audio element with a non-string src", () => {
		expect(
			isValidElementData({
				id: "audio-1",
				type: ElementTypeEnum.Audio,
				src: 123,
			}),
		).toBe(false)
	})

	it("accepts a storyboard element with unique, valid shots", () => {
		expect(
			isValidElementData({
				id: "storyboard-1",
				type: ElementTypeEnum.Storyboard,
				generationConfig: {
					model_id: "gpt-image-2",
					size: "1080x1920",
					resolution: "1K",
					image_generation_config: { aspect_ratio: "9:16" },
				},
				shots: [
					{
						id: "shot-1",
						durationSeconds: 4,
						description: "森林小路",
					},
				],
			}),
		).toBe(true)
	})

	it("rejects malformed storyboard shots and duplicate shot ids", () => {
		expect(
			isValidElementData({
				id: "storyboard-1",
				type: ElementTypeEnum.Storyboard,
				shots: [
					{
						id: "shot-1",
						durationSeconds: 0,
						description: "森林小路",
					},
				],
			}),
		).toBe(false)
		expect(
			isValidElementData({
				id: "storyboard-2",
				type: ElementTypeEnum.Storyboard,
				shots: [
					{
						id: "shot-1",
						durationSeconds: 3,
						description: "镜头一",
					},
					{
						id: "shot-1",
						durationSeconds: 3,
						description: "镜头二",
					},
				],
			}),
		).toBe(false)
		expect(
			isValidElementData({
				id: "storyboard-3",
				type: ElementTypeEnum.Storyboard,
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
		).toBe(false)
	})

	it("accepts a video merge element with ordered media inputs and output settings", () => {
		expect(
			isValidElementData({
				id: "video-edit-1",
				type: ElementTypeEnum.VideoEdit,
				videoSequence: ["video-s01", "video-s02"],
				audioSequence: ["audio-narration"],
				output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
			}),
		).toBe(true)
		expect(
			isValidElementData({
				id: "video-edit-empty",
				type: ElementTypeEnum.VideoEdit,
				videoSequence: [],
				audioSequence: [],
			}),
		).toBe(true)
	})

	it("rejects duplicate merge inputs and malformed output settings", () => {
		expect(
			isValidElementData({
				id: "video-edit-duplicate",
				type: ElementTypeEnum.VideoEdit,
				videoSequence: ["video-s01", "video-s01"],
				audioSequence: [],
			}),
		).toBe(false)
		expect(
			isValidElementData({
				id: "video-edit-invalid-output",
				type: ElementTypeEnum.VideoEdit,
				videoSequence: [],
				audioSequence: [],
				output: { resolution: 1024 },
			}),
		).toBe(false)
	})
})
