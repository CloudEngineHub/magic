import { describe, expect, it, vi } from "vitest"
import { exportCanvasDocument } from "../../../document/exportDocument"
import { ElementTypeEnum } from "../../../document/types"
import { TransformBehavior } from "../../../interaction/transform/TransformManager"
import { ElementFactory } from "../../core/ElementFactory"
import { VIDEO_EDIT_CONFIG } from "../VideoEditElement.config"
import { VideoEditElement } from "../VideoEditElement"

function createCanvasMock() {
	return {
		elementManager: {
			canDragElement: vi.fn(() => true),
			canListenElement: vi.fn(() => true),
		},
	} as never
}

describe("VideoEditElement", () => {
	it("creates a stable base DSL and factory instance", () => {
		const data = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 10,
			y: 20,
			videoSequence: ["video-s01", "video-s02"],
			audioSequence: ["audio-1"],
			output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
		})

		expect(data).toMatchObject({
			id: "video-edit-1",
			type: ElementTypeEnum.VideoEdit,
			contents: [
				{
					videoSequence: ["video-s01", "video-s02"],
					audioSequence: ["audio-1"],
				},
			],
			width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
		})
		expect(ElementFactory.create(data, createCanvasMock())).toBeInstanceOf(VideoEditElement)
	})

	it("keeps the node fixed-size and exports ordered inputs as a deep clone", () => {
		const source = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 0,
			y: 0,
			videoSequence: ["video-s02", "video-s01"],
			audioSequence: ["audio-1"],
			output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
		})
		const element = ElementFactory.create(source, createCanvasMock())

		expect(element?.getTransformBehavior()).toBe(TransformBehavior.APPLY_TO_SIZE)
		expect(element?.supportsSizeEditing()).toBe(false)

		const [exported] = exportCanvasDocument([source]).elements ?? []
		expect(exported).toEqual(source)
		expect(exported).not.toBe(source)
		if (exported?.type !== ElementTypeEnum.VideoEdit) {
			throw new Error("Expected video edit element")
		}
		const exportedContent = exported.contents[0]
		const sourceContent = source.contents[0]
		expect(exportedContent?.videoSequence).not.toBe(sourceContent?.videoSequence)
		expect(exportedContent?.audioSequence).not.toBe(sourceContent?.audioSequence)
		expect(exportedContent?.output).not.toBe(sourceContent?.output)
	})
})
