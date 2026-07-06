import { describe, expect, it } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import {
	OptionViewType,
	type OptionGroup,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import {
	createSlidesFixedSceneConfig,
	createSlidesPresetPanelConfig,
	groupSlidesTemplates,
	isSlidesMode,
	type SlidesTemplateCategoryItem,
	type SlidesTemplateItem,
} from "../slidesTemplateState"

const officialTemplate: SlidesTemplateItem = {
	code: "PPT-official",
	source_type: "SYSTEM",
	label: {
		zh_CN: "官方模板",
		en_US: "Official Template",
	},
	description: {
		zh_CN: "官方模板描述",
		en_US: "Official template description",
	},
	thumbnail_url: "https://example.com/official.png",
	collage_url: "https://example.com/official-collage.png",
	preview_url: "https://example.com/official-preview",
	sort: 100,
	is_official: true,
}

const organizationTemplate: SlidesTemplateItem = {
	code: "PPT-organization",
	source_type: "OFFICIAL",
	label: {
		zh_CN: "组织模板",
		en_US: "Organization Template",
	},
	description: {
		zh_CN: "组织模板描述",
		en_US: "Organization template description",
	},
	thumbnail_url: null,
	collage_url: null,
	preview_url: null,
	sort: 90,
	is_official: false,
}

const businessCategory: SlidesTemplateCategoryItem = {
	id: "1",
	code: "PPT-CATE-business",
	name_i18n: {
		zh_CN: "商务",
		en_US: "Business",
	},
	sort: 100,
	template_count: 1,
	is_official: true,
}

const educationCategory: SlidesTemplateCategoryItem = {
	id: "2",
	code: "PPT-CATE-education",
	name_i18n: {
		zh_CN: "教育",
		en_US: "Education",
	},
	sort: 90,
	template_count: 1,
	is_official: true,
}

describe("slides template state", () => {
	it("detects PPT topic mode", () => {
		expect(isSlidesMode(TopicMode.PPT)).toBe(true)
		expect(isSlidesMode(TopicMode.General)).toBe(false)
	})

	it("groups official and organization templates", () => {
		const groups = groupSlidesTemplates([organizationTemplate, officialTemplate])

		expect(groups).toHaveLength(3)
		expect(groups[0].group_key).toBe("all")
		expect(groups[0].group_icon).toBeUndefined()
		expect(groups[0].group_name).toEqual({ zh_CN: "全部", en_US: "All" })
		expect(groups[0].children?.map((child) => child.value)).toEqual([
			organizationTemplate.code,
			officialTemplate.code,
		])
		expect(groups[1].group_key).toBe("official")
		expect(groups[1].group_icon).toBeUndefined()
		expect(groups[1].children?.[0].value).toBe(officialTemplate.code)
		expect(groups[2].group_key).toBe("organization")
		expect(groups[2].group_icon).toBeUndefined()
		expect(groups[2].children?.[0].value).toBe(organizationTemplate.code)
	})

	it("omits organization group when there are no organization templates", () => {
		const groups = groupSlidesTemplates([officialTemplate])

		expect(groups).toHaveLength(2)
		expect(groups[0].group_key).toBe("all")
		expect(groups[1].group_key).toBe("official")
	})

	it("groups templates by category order when categories are available", () => {
		const businessTemplate = {
			...officialTemplate,
			code: "PPT-business",
			category_code: businessCategory.code,
		}
		const educationTemplate = {
			...organizationTemplate,
			code: "PPT-education",
			category_code: educationCategory.code,
		}
		const groups = groupSlidesTemplates(
			[educationTemplate, businessTemplate],
			[businessCategory, educationCategory],
		)

		expect(groups.map((group) => group.group_key)).toEqual([
			"all",
			businessCategory.code,
			educationCategory.code,
		])
		expect(groups[1].group_name).toEqual(businessCategory.name_i18n)
		expect(groups[1].group_icon).toBeUndefined()
		expect(groups[1].children?.[0].value).toBe(businessTemplate.code)
		expect(groups[2].children?.[0].value).toBe(educationTemplate.code)
	})

	it("keeps templates without matched category in other group", () => {
		const groups = groupSlidesTemplates([organizationTemplate], [businessCategory])

		expect(groups).toHaveLength(3)
		expect(groups[0].group_key).toBe("all")
		expect(groups[1].group_key).toBe(businessCategory.code)
		expect(groups[1].children).toEqual([])
		expect(groups[2].group_key).toBe("other")
		expect(groups[2].group_name).toEqual({ zh_CN: "其他", en_US: "Other" })
		expect(groups[2].group_icon).toBeUndefined()
		expect(groups[2].children?.[0].value).toBe(organizationTemplate.code)
	})

	it("does not add all and other visible groups when categories are empty", () => {
		const groups = groupSlidesTemplates([organizationTemplate], [])

		expect(groups).toHaveLength(1)
		expect(groups[0].group_key).toBe("all")
		expect(groups[0].children?.[0].value).toBe(organizationTemplate.code)
	})

	it("keeps the slides preset panel when API returns no templates", () => {
		const sceneConfig = createSlidesFixedSceneConfig([])

		expect(sceneConfig.config.scenes_config.presets).toBeDefined()
	})

	it("preserves static page, size, and language fields when templates exist", () => {
		const panel = createSlidesPresetPanelConfig([officialTemplate])
		const items = panel.field?.items ?? []

		expect(panel.field?.view_type).toBe(OptionViewType.SLIDES_PRESET)
		expect(items.map((item) => item.data_key)).toEqual(["style", "pages", "size", "language"])
		expect(items.find((item) => item.data_key === "style")?.options).not.toEqual([])
		expect(items.find((item) => item.data_key === "pages")?.options).not.toEqual([])
		expect(items.find((item) => item.data_key === "size")?.options).not.toEqual([])
		expect(items.find((item) => item.data_key === "language")?.options).not.toEqual([])
	})

	it("maps API template fields and removes empty media URLs", () => {
		const panel = createSlidesPresetPanelConfig([organizationTemplate])
		const styleField = panel.field?.items.find((item) => item.data_key === "style")
		const group = styleField?.options[0] as OptionGroup | undefined
		const option = group?.children?.[0]

		expect(option?.value).toBe(organizationTemplate.code)
		expect(option?.label).toEqual(organizationTemplate.label)
		expect(option?.description).toEqual(organizationTemplate.description)
		expect(option?.thumbnail_url).toBeUndefined()
		expect(option?.collage_url).toBeUndefined()
		expect(option?.preview_url).toBeUndefined()
	})
})
