import { describe, expect, it, vi } from "vitest"
import { drawShape } from "../src/drawer/drawShape"
import { drawText } from "../src/drawer/drawText"
import type { PPTShapeNode, PPTTextNode, Slide } from "../src/ir/node"

function createTextNode(overrides: Partial<PPTTextNode> = {}): PPTTextNode {
	return {
		type: "text",
		x: 1,
		y: 2,
		w: 3,
		h: 0.5,
		zOrder: 1,
		text: "Text",
		fontSize: 18,
		fontFace: "Arial",
		fontWeight: 400,
		color: "112233",
		bold: false,
		italic: false,
		underline: false,
		...overrides,
	}
}

function createSlideMock() {
	const addText = vi.fn()
	return {
		addText,
		slide: { addText } as unknown as Slide,
	}
}

describe("drawText", () => {
	it("passes exact text-frame options and explicit visual-line breaks to PptxGenJS", () => {
		const { addText, slide } = createSlideMock()
		const shadow = {
			type: "outer" as const,
			color: "000000",
			blur: 2,
			offset: 1,
			angle: 90,
			opacity: 0.25,
		}

		drawText(
			slide,
			createTextNode({
				text: [
					{ text: "first", options: { fontWeight: 600 } },
					{ text: "second", options: { softBreakBefore: true } },
					{
						text: "third",
						options: { breakLine: true, underline: true, strike: true },
					},
				],
				align: "center",
				valign: "middle",
				shadow,
				margin: [1, 2, 3, 4],
				wrap: false,
				lineSpacing: 1.4,
				lineSpacingPt: 21,
			}),
		)

		expect(addText).toHaveBeenCalledOnce()
		const [text, options] = addText.mock.calls[0]
		expect(text).toEqual([
			{ text: "first", options: undefined },
			{ text: "second", options: { softBreakBefore: true } },
			{
				text: "third",
				options: {
					breakLine: true,
					underline: { style: "sng" },
					strike: true,
				},
			},
		])
		expect(options).toMatchObject({
			align: "center",
			valign: "middle",
			shadow,
			margin: [4, 2, 3, 1],
			wrap: false,
			fit: "none",
			lineSpacing: 21,
		})
		expect(options).not.toHaveProperty("lineSpacingMultiple")
	})

	it("keeps the legacy line-spacing multiplier when no exact point value is provided", () => {
		const { addText, slide } = createSlideMock()

		drawText(slide, createTextNode({ lineSpacing: 1.25 }))

		const [, options] = addText.mock.calls[0]
		expect(options).toMatchObject({
			lineSpacingMultiple: 1.25,
			margin: [0, 0, 0, 0],
			wrap: true,
			fit: "none",
		})
		expect(options).not.toHaveProperty("lineSpacing")
	})

	it("uses the same CSS-to-Pptx margin order for text inside shapes", () => {
		const { addText, slide } = createSlideMock()
		const node: PPTShapeNode = {
			type: "shape",
			shapeType: "rect",
			x: 1,
			y: 2,
			w: 3,
			h: 1,
			zOrder: 1,
			fill: null,
			line: null,
			shadow: null,
			text: {
				value: "Badge",
				fontSize: 18,
				fontFace: "Arial",
				color: "112233",
				margin: [1, 2, 3, 4],
			},
		}

		drawShape(slide, node)

		expect(addText.mock.calls[0][1]).toMatchObject({ margin: [4, 2, 3, 1] })
	})
})
