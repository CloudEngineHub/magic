import { describe, expect, it } from "vitest"
import { SlidesTemplate } from "../../../../types/slidesTemplate"
import {
	buildSlidesTemplateSaveParams,
	getSlidesTemplateStatusByChecked,
	resolveSlidesTemplateTitle,
} from "../utils"

describe("slides template page utils", () => {
	it("builds save params from form values", () => {
		const payload = buildSlidesTemplateSaveParams({
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: "",
			template_file_key: "template.zip",
			preview_url: "",
			status: true,
			sort: null,
		})

		expect(payload).toEqual({
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: null,
			template_file_key: "template.zip",
			preview_url: null,
			status: SlidesTemplate.StatusMap.enabled,
			sort: 0,
		})
	})

	it("converts switch checked state to template status", () => {
		expect(getSlidesTemplateStatusByChecked(true)).toBe(SlidesTemplate.StatusMap.enabled)
		expect(getSlidesTemplateStatusByChecked(false)).toBe(SlidesTemplate.StatusMap.disabled)
	})

	it("resolves title with language fallback", () => {
		expect(
			resolveSlidesTemplateTitle({
				id: "1",
				organization_code: "OFFICIAL",
				code: "PPT-code",
				label: { zh_CN: "", en_US: "English Title" },
				description: { zh_CN: "", en_US: "" },
				thumbnail_file_key: "thumb.png",
				template_file_key: "template.zip",
				status: SlidesTemplate.StatusMap.enabled,
				sort: 0,
			}),
		).toBe("English Title")
	})
})
