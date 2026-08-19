import PptxGenJS from "pptxgenjs"
import { describe, expect, it, vi } from "vitest"
import { drawImage } from "../src/drawer/drawImage"
import type { PPTImageNode } from "../src/ir/node"
import { bytesMediaSourceDescriptor } from "../src/media/source-descriptor"

describe("drawImage v5 mapping", () => {
	it("maps descriptor-only image IR to the v5 ImageProps contract", () => {
		const slide = new PptxGenJS().addSlide()
		const addImage = vi.spyOn(slide, "addImage").mockReturnValue(slide)
		const source = bytesMediaSourceDescriptor({
			data: new Uint8Array([1, 2, 3]).buffer,
			contentType: "image/png",
		})
		const node: PPTImageNode = {
			type: "image",
			x: 1,
			y: 2,
			w: 4,
			h: 3,
			zOrder: 1,
			source,
			sizing: "crop",
			rotate: 15,
			transparency: 25,
		}

		drawImage(slide, node)

		expect(addImage).toHaveBeenCalledWith({
			x: 1,
			y: 2,
			w: 4,
			h: 3,
			source,
			rotate: 15,
			transparency: 25,
			sizing: { type: "crop", x: 0, y: 0, w: 4, h: 3 },
		})
	})
})
