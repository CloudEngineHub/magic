import { describe, expect, it } from "vitest"
import { SlidesTemplate } from "../../../../types/slidesTemplate"
import {
	buildSlidesTemplateCategorySaveParams,
	buildSlidesTemplateSaveParams,
	getSlidesTemplateStatusByChecked,
	isSystemSlidesTemplate,
	resolveSlidesTemplateCategoryName,
	resolveSlidesTemplateTitle,
} from "../utils"

describe("slides template page utils", () => {
	it("builds save params from form values", () => {
		const payload = buildSlidesTemplateSaveParams({
			category_code: "PPT-CATE-business",
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
			category_code: "PPT-CATE-business",
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

	it("clears empty template category code", () => {
		const payload = buildSlidesTemplateSaveParams({
			category_code: "",
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: null,
			template_file_key: "template.zip",
			preview_url: null,
			status: false,
			sort: 10,
		})

		expect(payload.category_code).toBeNull()
	})

	it("builds category save params from form values", () => {
		const payload = buildSlidesTemplateCategorySaveParams({
			code: " PPT-CATE-business ",
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: true,
			sort: null,
		})

		expect(payload).toEqual({
			code: "PPT-CATE-business",
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: SlidesTemplate.StatusMap.enabled,
			sort: 0,
		})
	})

	it("omits empty category code from category save params", () => {
		const payload = buildSlidesTemplateCategorySaveParams({
			code: "",
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: true,
			sort: 1,
		})

		expect(payload).toEqual({
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: SlidesTemplate.StatusMap.enabled,
			sort: 1,
		})
	})

	it("converts switch checked state to template status", () => {
		expect(getSlidesTemplateStatusByChecked(true)).toBe(SlidesTemplate.StatusMap.enabled)
		expect(getSlidesTemplateStatusByChecked(false)).toBe(SlidesTemplate.StatusMap.disabled)
	})

	it("detects system built-in templates by source type", () => {
		expect(
			isSystemSlidesTemplate({
				source_type: SlidesTemplate.SourceTypeMap.system,
			}),
		).toBe(true)
		expect(
			isSystemSlidesTemplate({
				source_type: SlidesTemplate.SourceTypeMap.official,
			}),
		).toBe(false)
		expect(isSystemSlidesTemplate({ source_type: undefined })).toBe(false)
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

	it("resolves category name with language fallback", () => {
		expect(
			resolveSlidesTemplateCategoryName({
				id: "1",
				organization_code: "OFFICIAL",
				code: "PPT-CATE-business",
				name_i18n: { zh_CN: "", en_US: "Business" },
				sort: 0,
				template_count: 0,
				is_official: true,
				status: SlidesTemplate.StatusMap.enabled,
			}),
		).toBe("Business")
	})
})
