import { describe, expect, it } from "vitest"
import type { RichTextParagraph } from "../../document/types"
import { extractPromptTextFromRichText } from "../richText"

function paragraph(
	text: string,
	listType?: NonNullable<NonNullable<RichTextParagraph["style"]>["listType"]>,
): RichTextParagraph {
	return {
		children: [{ type: "text", text }],
		style: listType ? { listType } : undefined,
	}
}

describe("extractPromptTextFromRichText", () => {
	it("keeps plain paragraph line breaks", () => {
		expect(
			extractPromptTextFromRichText([paragraph("first line"), paragraph("second line")]),
		).toBe("first line\nsecond line")
	})

	it("serializes bullet list markers", () => {
		expect(
			extractPromptTextFromRichText([
				paragraph("first bullet", "bullet"),
				paragraph("second bullet", "bullet"),
			]),
		).toBe("• first bullet\n• second bullet")
	})

	it("serializes ordered list markers with the rendered numbering", () => {
		expect(
			extractPromptTextFromRichText([
				paragraph("first item", "ordered"),
				paragraph("second item", "ordered"),
			]),
		).toBe("1. first item\n2. second item")
	})

	it("keeps mixed paragraph breaks and ordered list numbering", () => {
		expect(
			extractPromptTextFromRichText([
				paragraph("intro"),
				paragraph("first item", "ordered"),
				paragraph("bullet item", "bullet"),
				paragraph("second item", "ordered"),
				paragraph("outro"),
			]),
		).toBe("intro\n1. first item\n• bullet item\n2. second item\noutro")
	})

	it("preserves empty paragraphs as prompt line breaks", () => {
		expect(
			extractPromptTextFromRichText([paragraph("before"), paragraph(""), paragraph("after")]),
		).toBe("before\n\nafter")
	})
})
