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
})
