import JSZip from "jszip"
import PptxGenJS from "pptxgenjs"
import { describe, expect, it } from "vitest"
import { drawText } from "../src/drawer/drawText"
import type { PPTTextNode } from "../src/ir/node"

describe("PowerPoint text XML", () => {
	it("writes the HTML frame exactly and locks browser lines with a soft break", async () => {
		const pptx = new PptxGenJS()
		const slide = pptx.addSlide()
		const node: PPTTextNode = {
			type: "text",
			x: 197 / 96,
			y: 465 / 96,
			w: 100 / 96,
			h: 28 / 96,
			zOrder: 1,
			text: [{ text: "first" }, { text: "second", options: { softBreakBefore: true } }],
			fontSize: 15,
			fontFace: "Arial",
			fontWeight: 400,
			color: "112233",
			bold: false,
			italic: false,
			underline: false,
			valign: "top",
			margin: [3, 4, 5, 6],
			wrap: false,
			lineSpacingPt: 21,
		}
		drawText(slide, node)

		const output = await pptx.write({ outputType: "arraybuffer" })
		const zip = await JSZip.loadAsync(output as ArrayBuffer)
		const slideXml = await zip.file("ppt/slides/slide1.xml")?.async("string")
		if (!slideXml) throw new Error("slide1.xml is required")

		expect(slideXml).toContain('<a:off x="1876425" y="4429125"/>')
		expect(slideXml).toContain('<a:ext cx="952500" cy="266700"/>')
		expect(slideXml).toMatch(/<a:bodyPr[^>]*wrap="none"/)
		expect(slideXml).toMatch(/lIns="76200"/)
		expect(slideXml).toMatch(/tIns="38100"/)
		expect(slideXml).toMatch(/rIns="50800"/)
		expect(slideXml).toMatch(/bIns="63500"/)
		expect(slideXml).toContain("<a:br/>")
		expect(slideXml).toContain('<a:spcPts val="2100"/>')
		expect(slideXml).not.toContain("<a:spcPct")
	})
})
