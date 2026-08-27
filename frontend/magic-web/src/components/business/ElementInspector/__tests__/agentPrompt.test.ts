import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { buildHtmlMultiSelectionPromptContent } from "../agentPrompt"
import type { HtmlSelectionTarget } from "../types"

describe("HTML inspector agent prompt", () => {
	it("renders the HTML file and screenshot as mention nodes", () => {
		const screenshot: HtmlSelectionTarget = {
			id: "screenshot:1",
			kind: "screenshot",
			screenshot: {
				dataUrl: "data:image/png;base64,abc",
				rect: { top: 1, left: 2, width: 30, height: 40 },
			},
			instruction: "Align this card",
		}
		const content = buildHtmlMultiSelectionPromptContent(
			{ fileId: "html-1", fileName: "index.html", filePath: "index.html" },
			[screenshot],
			"Inspector details",
			new Map([
				[
					"screenshot:1",
					{
						type: MentionItemType.UPLOAD_FILE,
						data: {
							file_id: "image-1",
							file_name: "html-screenshot-1.png",
							file_extension: "png",
							file_path: "html-screenshot-1.png",
						},
					},
				],
			]),
		)

		const mentions = (content.content ?? [])
			.flatMap((paragraph) => paragraph.content ?? [])
			.filter((node) => node.type === "mention")

		expect(mentions).toHaveLength(2)
		expect(mentions[0]?.attrs?.type).toBe(MentionItemType.PROJECT_FILE)
		expect(mentions[1]?.attrs?.type).toBe(MentionItemType.UPLOAD_FILE)
		expect(JSON.stringify(content)).toContain("Align this card")
	})
})
