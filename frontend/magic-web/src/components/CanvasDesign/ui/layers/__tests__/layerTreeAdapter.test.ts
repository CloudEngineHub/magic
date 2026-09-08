import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../runtime/core/Canvas"
import {
	ElementTypeEnum,
	type ImageElement,
	type VideoElement,
} from "../../../runtime/document/types"
import { convertLayerToTreeNode } from "../layerTreeAdapter"

describe("convertLayerToTreeNode", () => {
	it("uses the element display name so image status stays aligned with canvas labels", () => {
		const getNameLabelText = vi.fn(() => "Pasted image(上传中)")
		const canvas = {
			elementManager: {
				getElementInstance: vi.fn(() => ({ getNameLabelText })),
			},
		} as unknown as Canvas
		const image: ImageElement = {
			id: "image-1",
			name: "Pasted image",
			type: ElementTypeEnum.Image,
			activeContentId: "image-content-1",
			mainContentId: "image-content-1",
			contents: [{ contentId: "image-content-1", status: "processing" }],
		}

		expect(convertLayerToTreeNode(image, canvas).label).toBe("Pasted image(上传中)")
		expect(getNameLabelText).toHaveBeenCalledTimes(1)
	})

	it("uses the video display name supplied by the element instance", () => {
		const getNameLabelText = vi.fn(() => "合并视频(合并中)")
		const canvas = {
			elementManager: {
				getElementInstance: vi.fn(() => ({ getNameLabelText })),
			},
		} as unknown as Canvas
		const video: VideoElement = {
			id: "video-1",
			name: "合并视频",
			type: ElementTypeEnum.Video,
			activeContentId: "video-content-1",
			mainContentId: "video-content-1",
			contents: [{ contentId: "video-content-1", status: "processing" }],
		}

		expect(convertLayerToTreeNode(video, canvas).label).toBe("合并视频(合并中)")
		expect(getNameLabelText).toHaveBeenCalledTimes(1)
	})
})
