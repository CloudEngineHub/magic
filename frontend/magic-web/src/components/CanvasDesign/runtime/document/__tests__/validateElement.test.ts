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
})
