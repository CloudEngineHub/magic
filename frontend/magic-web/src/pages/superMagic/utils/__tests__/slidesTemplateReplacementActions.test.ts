import { describe, expect, it } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import {
	buildSlidesTemplateReplacementPayload,
	type SlidesTemplateReplacementTarget,
} from "../slidesTemplateReplacementActions"

const template: OptionItem = {
	value: "PPT-TPL-ABC123",
	label: "商务蓝",
}

const mainFile = {
	file_id: "ppt-1",
	file_name: "季度汇报.html",
	relative_file_path: "演示/季度汇报.html",
	file_extension: "html",
} as any

const folder = {
	file_id: "folder-1",
	file_name: "演示",
	relative_file_path: "演示",
	is_directory: true,
} as any

describe("buildSlidesTemplateReplacementPayload", () => {
	it.each([
		["deck", { scope: "deck" }],
		["slide", { scope: "slide", slideIndex: 2 }],
	] as Array<[string, SlidesTemplateReplacementTarget]>)(
		"includes the exact template code and scope for %s requests",
		(_label, target) => {
			const payload = buildSlidesTemplateReplacementPayload({
				template,
				target,
				mainFile,
				parentFolder: folder,
				targetSlide: {
					file_id: "slide-3",
					file_name: "page3.html",
					relative_file_path: "演示/slides/page3.html",
					file_extension: "html",
				} as any,
			})

			const text = JSON.stringify(payload.afterCreate?.content)
			const mentionItems = payload.afterCreate?.mentionItems ?? []
			expect(text).toContain("PPT-TPL-ABC123")
			expect(text).toContain(target.scope === "deck" ? "整本 PPT" : "第 3 页")
			expect(text).not.toContain("slide-template-replacement Skill")
			expect(payload.topicMode).toBe("ppt")
			expect(payload.afterCreate?.topicMode).toBe("ppt")
			expect(payload.afterCreate?.send).toBe(true)
			expect(mentionItems).toHaveLength(target.scope === "deck" ? 2 : 1)
			expect(mentionItems[0]?.attrs.type).toBe(MentionItemType.PROJECT_FILE)
			if (target.scope === "deck") {
				expect(mentionItems[1]?.attrs.type).toBe(MentionItemType.FOLDER)
			} else {
				expect(text).toContain("目标页")
				expect(text).not.toContain("所属文件夹")
				expect(text).not.toContain("当前 PPT：")
			}
		},
	)
})
