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

describe("slides template state", () => {
	it("detects PPT topic mode", () => {
		expect(isSlidesMode(TopicMode.PPT)).toBe(true)
		expect(isSlidesMode(TopicMode.General)).toBe(false)
	})

	it("groups official and organization templates", () => {
		const groups = groupSlidesTemplates([organizationTemplate, officialTemplate])

		expect(groups).toHaveLength(2)
		expect(groups[0].group_key).toBe("official")
		expect(groups[0].children?.[0].value).toBe(officialTemplate.code)
		expect(groups[1].group_key).toBe("organization")
		expect(groups[1].children?.[0].value).toBe(organizationTemplate.code)
	})

	it("omits organization group when there are no organization templates", () => {
		const groups = groupSlidesTemplates([officialTemplate])

		expect(groups).toHaveLength(1)
		expect(groups[0].group_key).toBe("official")
	})

	it("does not render config panels when API returns no templates", () => {
		const sceneConfig = createSlidesFixedSceneConfig([])

		expect(sceneConfig.config.scenes_config).toEqual({})
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
