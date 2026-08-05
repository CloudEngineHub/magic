import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "../types"
import { isValidElementData } from "../validateElement"

describe("isValidElementData", () => {
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
