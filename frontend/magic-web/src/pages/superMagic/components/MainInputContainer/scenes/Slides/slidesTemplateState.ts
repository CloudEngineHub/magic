import {
	OptionViewType,
	SkillPanelType,
	type FieldPanelConfig,
	type OptionGroup,
	type SkillPanelConfig,
} from "../../panels/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

export interface SlidesTemplateItem {
	code: string
	label: {
		zh_CN: string
		en_US: string
	}
	description: {
		zh_CN: string
		en_US: string
	}
	thumbnail_url?: string | null
	collage_url?: string | null
	preview_url?: string | null
	sort: number
	is_official: boolean
}

export interface SlidesTemplateQueryParams {
	page?: number
	page_size?: number
	keyword?: string
}

export interface SlidesTemplateListResponse {
	page: number
	page_size: number
	total: number
	list: SlidesTemplateItem[]
}

export const SLIDES_TEMPLATE_PAGE_SIZE = 200

export function isSlidesMode(topicMode: TopicMode | undefined) {
	return topicMode === TopicMode.PPT
}

const slidesStaticFields: NonNullable<FieldPanelConfig["field"]>["items"] = [
	{
		data_key: "style",
		label: { zh_CN: "模板", en_US: "Preset" },
		option_view_type: OptionViewType.GRID,
		default_value: "",
		preset_content: {
			zh_CN: "使用 PPT 模板：{preset_value}",
			en_US: "Use PPT template: {preset_value}",
		},
		options: [],
	},
	{
		data_key: "pages",
		label: { zh_CN: "页数", en_US: "Pages" },
		default_value: "",
		options: [
			{ value: "1-5", label: "1-5" },
			{ value: "6-10", label: "6-10" },
			{ value: "10+", label: "10+" },
		],
	},
	{
		data_key: "size",
		label: { zh_CN: "尺寸", en_US: "Size" },
		has_leading_icon: true,
		leading_icon: "square",
		options: [
			{ value: "16:9", label: "16:9" },
			{ value: "4:3", label: "4:3" },
			{ value: "1:1", label: "1:1" },
		],
	},
	{
		data_key: "language",
		label: { zh_CN: "语言", en_US: "Language" },
		default_value: "",
		options: [
			{ value: "auto", label: { zh_CN: "自动", en_US: "Auto" } },
			{ value: "zh", label: { zh_CN: "中文", en_US: "Chinese" } },
			{ value: "en", label: { zh_CN: "英文", en_US: "English" } },
		],
	},
]

export function groupSlidesTemplates(templates: SlidesTemplateItem[]): OptionGroup[] {
	const officialTemplates = templates.filter((template) => template.is_official)
	const organizationTemplates = templates.filter((template) => !template.is_official)
	const groups: OptionGroup[] = []

	if (officialTemplates.length) {
		groups.push({
			group_key: "official",
			group_name: { zh_CN: "官方模板", en_US: "Official Templates" },
			group_icon: "LayoutTemplate",
			children: officialTemplates.map(toTemplateOption),
		})
	}

	if (organizationTemplates.length) {
		groups.push({
			group_key: "organization",
			group_name: { zh_CN: "组织模板", en_US: "Organization Templates" },
			group_icon: "Building2",
			children: organizationTemplates.map(toTemplateOption),
		})
	}

	return groups
}

export function createSlidesPresetPanelConfig(templates: SlidesTemplateItem[]): FieldPanelConfig {
	const groups = groupSlidesTemplates(templates)
	return {
		type: SkillPanelType.FIELD,
		title: { zh_CN: "模板", en_US: "Preset" },
		expandable: true,
		default_expanded: true,
		field: {
			view_type: OptionViewType.SLIDES_PRESET,
			items: slidesStaticFields.map((item) =>
				item.data_key === "style"
					? {
							...item,
							default_group_key: groups[0]?.group_key,
							options: groups,
						}
					: item,
			),
		},
	}
}

export function createSlidesFixedSceneConfig(templates: SlidesTemplateItem[]) {
	const panels: SkillPanelConfig[] = templates.length
		? [createSlidesPresetPanelConfig(templates)]
		: []

	return {
		placeholder: {
			zh_CN: "描述你想要生成的 PPT 主题和内容...",
			en_US: "Describe the PPT theme and content you want to generate...",
		},
		config: {
			scenes_config: {
				...(panels[0] ? { presets: panels[0] } : {}),
			},
		},
	}
}

function toTemplateOption(template: SlidesTemplateItem) {
	return {
		value: template.code,
		label: template.label,
		thumbnail_url: template.thumbnail_url ?? undefined,
		collage_url: template.collage_url ?? undefined,
		description: template.description,
		preview_url: template.preview_url ?? undefined,
		preview_title: {
			zh_CN: `${template.label.zh_CN}预览`,
			en_US: `${template.label.en_US} Preview`,
		},
	}
}

export const slidesFixedSceneConfig = createSlidesFixedSceneConfig([])
