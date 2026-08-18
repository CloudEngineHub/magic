import { describe, expect, it } from "vitest"
import { ElementTypeEnum } from "../../../document/types"
import { VideoEditElement } from "../VideoEditElement"

describe("VideoEditElement", () => {
	it("creates the backend-composition DSL without output configuration", () => {
		const data = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 10,
			y: 20,
			videoSequence: ["video-1"],
			audioSequence: ["audio-1"],
		})

		expect(data.type).toBe(ElementTypeEnum.VideoEdit)
		expect(data.contents[0]).toEqual({
			contentId: "video-edit-1-content-1",
			videoSequence: ["video-1"],
			audioSequence: ["audio-1"],
		})
		expect(data.contents[0]).not.toHaveProperty("output")
	})
})
