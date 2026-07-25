import { describe, expect, it } from "vitest"
import { SlidesTemplate } from "../../../../types/slidesTemplate"
import {
	SLIDES_TEMPLATE_TAG_CODE_PATTERN,
	SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN,
	buildSlidesTemplateCategorySaveParams,
	buildSlidesTemplateSaveParams,
	buildSlidesTemplateTagSaveParams,
	generateSlidesTemplateCode,
	getSlidesTemplateStatusByChecked,
	getSlidesTemplateStatusColor,
	isSystemSlidesTemplate,
	joinUploadDir,
	resolveSlidesTemplateCategoryName,
	resolveSlidesTemplateTagName,
	resolveSlidesTemplateTitle,
	setSlidesTemplateTagEnabled,
} from "../utils"

describe("slides template page utils", () => {
	it("builds save params from form values", () => {
		const payload = buildSlidesTemplateSaveParams({
			category_code: "PPT-CATE-business",
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: "",
			preview_image_file_keys: ["preview-1.png", "preview-2.png"],
			template_file_key: "template.zip",
			preview_url: "",
			tag_codes: ["featured", "business"],
			status: true,
			sort: null,
		})

		expect(payload).toEqual({
			category_code: "PPT-CATE-business",
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: null,
			preview_image_file_keys: ["preview-1.png", "preview-2.png"],
			template_file_key: "template.zip",
			preview_url: null,
			tag_codes: ["featured", "business"],
			status: SlidesTemplate.StatusMap.enabled,
			sort: 0,
		})
	})

	it("generates backend-compatible template code", () => {
		const firstCode = generateSlidesTemplateCode()
		const secondCode = generateSlidesTemplateCode()

		expect(firstCode).toMatch(/^PPT-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/)
		expect(secondCode).toMatch(/^PPT-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/)
		expect(firstCode).not.toBe(secondCode)
	})

	it("includes optional code when building save params", () => {
		const payload = buildSlidesTemplateSaveParams({
			code: "PPT-Abc123",
			category_code: "PPT-CATE-business",
			label: { zh_CN: "模板", en_US: "Template" },
			description: { zh_CN: "描述", en_US: "Description" },
			thumbnail_file_key: "thumb.png",
			collage_file_key: null,
			preview_image_file_keys: [],
			template_file_key: "template.zip",
			preview_url: null,
			status: true,
			sort: 10,
		})

		expect(payload.code).toBe("PPT-Abc123")
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
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: true,
			sort: null,
		})

		expect(payload).toEqual({
			name_i18n: { zh_CN: "商务", en_US: "Business" },
			status: SlidesTemplate.StatusMap.enabled,
			sort: 0,
		})
	})

	it("builds category save params without code", () => {
		const payload = buildSlidesTemplateCategorySaveParams({
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

	it("builds tag save params from form values", () => {
		const payload = buildSlidesTemplateTagSaveParams({
			code: " featured ",
			node_type: "tag",
			parent_id: "group-1",
			name_i18n: { zh_CN: "精选", en_US: "Featured" },
			status: true,
			sort: null,
		})

		expect(payload).toEqual({
			code: "featured",
			node_type: "tag",
			parent_id: "group-1",
			name_i18n: { zh_CN: "精选", en_US: "Featured" },
			status: SlidesTemplate.StatusMap.enabled,
			sort: 0,
		})
	})

	it("validates tag and tag-group code formats", () => {
		expect(SLIDES_TEMPLATE_TAG_CODE_PATTERN.test("purpose-annual-report")).toBe(true)
		expect(SLIDES_TEMPLATE_TAG_CODE_PATTERN.test("purpose_annual_report")).toBe(false)
		expect(SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN.test("purpose_group")).toBe(true)
		expect(SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN.test("audience_scene_group")).toBe(true)
		expect(SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN.test("audience-scene_group")).toBe(true)
		expect(SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN.test("audience_scene")).toBe(false)
		expect(SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN.test("audience__scene_group")).toBe(false)
	})

	it("converts switch checked state to template status", () => {
		expect(getSlidesTemplateStatusByChecked(true)).toBe(SlidesTemplate.StatusMap.enabled)
		expect(getSlidesTemplateStatusByChecked(false)).toBe(SlidesTemplate.StatusMap.disabled)
	})

	it("keeps featured switch and tag codes in sync", () => {
		expect(setSlidesTemplateTagEnabled(["business", "featured"], "featured", false)).toEqual([
			"business",
		])
		expect(setSlidesTemplateTagEnabled(["business"], "featured", true)).toEqual([
			"business",
			"featured",
		])
		expect(setSlidesTemplateTagEnabled(["featured", "featured"], "featured", true)).toEqual([
			"featured",
		])
	})

	it("resolves status tag color", () => {
		expect(getSlidesTemplateStatusColor(SlidesTemplate.StatusMap.enabled)).toBe("success")
		expect(getSlidesTemplateStatusColor(SlidesTemplate.StatusMap.disabled)).toBe("error")
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

	it("joins upload credential dir and business dir", () => {
		expect(joinUploadDir("org/public", "slide-templates/PPT-001/")).toBe(
			"org/public/slide-templates/PPT-001/",
		)
		expect(joinUploadDir("org/public/", "/slide-templates/PPT-001/previews/")).toBe(
			"org/public/slide-templates/PPT-001/previews/",
		)
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

	it("resolves tag name with language fallback", () => {
		expect(
			resolveSlidesTemplateTagName({
				id: "1",
				organization_code: "OFFICIAL",
				code: "featured",
				parent_id: "group-1",
				node_type: "tag",
				name_i18n: { zh_CN: "", en_US: "Featured" },
				sort: 0,
				template_count: 0,
				is_official: true,
				status: SlidesTemplate.StatusMap.enabled,
			}),
		).toBe("Featured")
	})
})
