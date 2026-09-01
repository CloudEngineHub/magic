import { describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { INSPECTOR_DETAIL_TYPE } from "../../extensions/inspector-detail/const"
import { collectMentionItemsFromContent } from "../uploadMentionService"

describe("uploadMentionService inspector-detail mentions", () => {
	it("collects project file mentions stored inside inspector-detail attrs", () => {
		const fileMention = {
			type: MentionItemType.PROJECT_FILE,
			data: {
				file_id: "file-1",
				file_name: "index.html",
				file_path: "/index.html",
				file_extension: "html",
			},
		}

		const items = collectMentionItemsFromContent({
			type: "doc",
			content: [
				{
					type: INSPECTOR_DETAIL_TYPE,
					attrs: {
						title: "Selected element",
						selector: "body > button.primary",
						tagName: "button",
						size: "120 x 40 px",
						computedStyles: "{}",
						styleCount: 0,
						textContent: "Submit",
						fileMention,
					},
				},
			],
		})

		expect(items).toEqual([{ type: "mention", attrs: fileMention }])
	})

	it("collects screenshot mentions stored inside inspector-detail attrs", () => {
		const screenshotMention = {
			type: MentionItemType.PROJECT_FILE,
			data: {
				file_id: "screenshot-1",
				file_name: "hero.png",
				file_path: ".tmp/hero.png",
				file_extension: "png",
				is_hidden: true,
			},
		}

		const items = collectMentionItemsFromContent({
			type: "doc",
			content: [
				{
					type: INSPECTOR_DETAIL_TYPE,
					attrs: {
						title: "Selected element",
						selector: "body > section.hero",
						tagName: "section",
						size: "300 x 120 px",
						computedStyles: "{}",
						styleCount: 0,
						textContent: "Hero",
						screenshotMention,
					},
				},
			],
		})

		expect(items).toEqual([{ type: "mention", attrs: screenshotMention }])
	})

	it("does not collect pending canvas mentions as formal mention items", () => {
		const items = collectMentionItemsFromContent({
			type: "doc",
			content: [
				{
					type: "mention",
					attrs: {
						type: MentionItemType.PROJECT_FILE,
						data: {
							file_id: "pending-file",
							file_name: "pending.png",
							file_path: "/pending.png",
						},
						pending: true,
						pendingId: "canvas-selection:1",
					},
				},
			],
		})

		expect(items).toEqual([])
	})
})
