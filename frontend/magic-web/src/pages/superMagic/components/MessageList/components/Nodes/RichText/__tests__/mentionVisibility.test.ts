import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { getMentionItemsMissingFromRichTextContent } from "../mentionVisibility"

const createProjectFileMention = (fileId: string): TiptapMentionAttributes => ({
	type: MentionItemType.PROJECT_FILE,
	data: {
		file_id: fileId,
		file_name: `${fileId}.png`,
		file_extension: "png",
	},
})

const createMarkerMention = (markNumber: number, markerId?: string): TiptapMentionAttributes => ({
	type: MentionItemType.DESIGN_MARKER,
	data: {
		image: "images/marker.png",
		label: `Marker ${markNumber}`,
		kind: "object",
		mark_number: markNumber,
		...(markerId ? { marker_id: markerId } : {}),
	} as TiptapMentionAttributes["data"],
})

describe("getMentionItemsMissingFromRichTextContent", () => {
	it("omits mentions already rendered inline in rich text", () => {
		const mention = createProjectFileMention("file-1")

		const result = getMentionItemsMissingFromRichTextContent([{ attrs: mention }], {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "mention", attrs: mention }] }],
		})

		expect(result).toEqual([])
	})

	it("retains legacy mentions that are absent from rich text", () => {
		const mention = createProjectFileMention("file-1")

		const result = getMentionItemsMissingFromRichTextContent([{ attrs: mention }], "纯文本消息")

		expect(result).toEqual([{ type: "mention", attrs: mention }])
	})

	it("keeps only the missing mentions when representations are mixed", () => {
		const inlineMention = createProjectFileMention("file-1")
		const legacyOnlyMention = createProjectFileMention("file-2")

		const result = getMentionItemsMissingFromRichTextContent(
			[{ attrs: inlineMention }, { attrs: legacyOnlyMention }],
			{
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "mention", attrs: inlineMention }] },
				],
			},
		)

		expect(result).toEqual([{ type: "mention", attrs: legacyOnlyMention }])
	})

	it("matches legacy marker metadata to an inline marker by mark number", () => {
		const legacyMention = createMarkerMention(1)
		const inlineMention = createMarkerMention(1, "marker-1")

		const result = getMentionItemsMissingFromRichTextContent([{ attrs: legacyMention }], {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "mention", attrs: inlineMention }] }],
		})

		expect(result).toEqual([])
	})

	it("does not fall back to mark number when metadata already has a marker id", () => {
		const metadataMention = createMarkerMention(1, "marker-legacy")
		const inlineMention = createMarkerMention(1, "marker-1")

		const result = getMentionItemsMissingFromRichTextContent([{ attrs: metadataMention }], {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "mention", attrs: inlineMention }] }],
		})

		expect(result).toEqual([{ type: "mention", attrs: metadataMention }])
	})
})
