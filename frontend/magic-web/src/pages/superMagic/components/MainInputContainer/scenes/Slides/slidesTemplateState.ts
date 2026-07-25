import type { JSONContent } from "@tiptap/core"
import {
	OptionViewType,
	SkillPanelType,
	type FieldPanelConfig,
	type OptionGroup,
	type OptionItem,
	type OptionItemTag,
	type SkillPanelConfig,
} from "../../panels/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ImageProcessOptions } from "@/utils/image-processing"
import {
	FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_VALUE,
	RESOURCE_CACHE_MARK_QUERY_PARAM,
	SLIDES_TEMPLATE_IMAGE_CACHE_VALUE,
} from "@/workers/service-worker/sw-constants"
import { buildConcatenatedPresetContent, localeTextToDisplayString } from "../../panels/utils"
import { FEATURED_SLIDES_TEMPLATE_TAG_CODE } from "../../panels/slides-preset/templateMeta"

export interface SlidesTemplateItem {
	code: string
	source_type?: "SYSTEM" | "OFFICIAL"
	category_code?: string | null
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
	preview_image_urls?: string[]
	preview_url?: string | null
	sort: number
	is_official: boolean
	usage_count?: number
	colors?: string[]
	tags?: SlidesTemplateItemTag[]
}

export interface SlidesTemplateItemTag extends OptionItemTag {
	id: string
	code: string
	name_i18n: {
		zh_CN: string
		en_US: string
	}
	sort: number
}

export interface SlidesTemplateQueryParams {
	page?: number
	page_size?: number
	keyword?: string
	category_code?: string
	tag_codes?: string | string[]
	tag_match?: SlidesTemplateTagMatch
}

export interface SlidesTemplateListResponse {
	page: number
	page_size: number
	list: SlidesTemplateItem[]
}

export interface SlidesTemplateCountResponse {
	total: number
	/**
	 * 模板累计使用量。服务端灰度发布前可能不返回；前端不能用模板数量替代它。
	 */
	total_usage_count?: number
	/** 今日新增模板数。服务端灰度发布前可能不返回。 */
	template_count_today_growth?: number
}

/** 列表只提供封面；打开预览时再读取详情中的大图资源。 */
export interface SlidesTemplateDetail extends SlidesTemplateItem {
	colors: string[]
	collage_url: string | null
	preview_image_urls: string[]
	preview_url: string | null
}

export interface SlidesTemplateCategoryItem {
	id: string
	code: string
	name_i18n: {
		zh_CN: string
		en_US: string
	}
	sort: number
	template_count: number
	is_official: boolean
}

export interface SlidesTemplateCategoryQueryParams {
	page?: number
	page_size?: number
	keyword?: string
}

export interface SlidesTemplateCategoryListResponse {
	page: number
	page_size: number
	total: number
	list: SlidesTemplateCategoryItem[]
}

export type SlidesTemplateTagMatch = "any" | "all"

export interface SlidesTemplateTagItem {
	id: string
	code: string
	name_i18n: {
		zh_CN: string
		en_US: string
	}
	sort: number
	template_count: number
	is_official: boolean
}

export interface SlidesTemplateTagGroupItem {
	id: string
	code: string
	name_i18n: {
		zh_CN: string
		en_US: string
	}
	sort: number
	tags: SlidesTemplateTagItem[]
}

export const ALL_SLIDES_TEMPLATE_GROUP_KEY = "all"
export const SYSTEM_SLIDES_TEMPLATE_TAG_GROUP_CODE = "operational_group"

export const OTHER_SLIDES_TEMPLATE_GROUP_KEY = "other"
export const SLIDES_TEMPLATE_CATEGORY_GROUP_KEY_PREFIX = "category:"
export const SLIDES_TEMPLATE_TAG_GROUP_KEY_PREFIX = "tag:"
export const SLIDES_TEMPLATE_PAGE_SIZE = 20
export const SLIDES_TEMPLATE_CATEGORY_PAGE_SIZE = 200
export const SLIDES_TEMPLATE_DEFAULT_SIZE = "16:9"
export const SLIDES_TEMPLATE_DEFAULT_LANGUAGE = "auto"
export const SLIDES_TEMPLATE_IMAGE_PROCESS: ImageProcessOptions = {
	resize: { w: 1920 },
	format: "webp",
}

/**
 * Only template catalog media receives these markers. Featured and ordinary resources use
 * separate Service Worker buckets without depending on a storage-domain allowlist.
 */
function markSlidesTemplateImageUrlByCacheValue<T extends string | null | undefined>(
	url: T,
	cacheValue: string,
): T
function markSlidesTemplateImageUrlByCacheValue(
	url: string | null | undefined,
	cacheValue: string,
) {
	if (!url) return url

	try {
		const parsedUrl = new URL(url)
		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return url

		parsedUrl.searchParams.set(RESOURCE_CACHE_MARK_QUERY_PARAM, cacheValue)
		return parsedUrl.toString()
	} catch {
		return url
	}
}

export function markSlidesTemplateImageUrl<T extends string | null | undefined>(url: T): T
export function markSlidesTemplateImageUrl(url: string | null | undefined) {
	return markSlidesTemplateImageUrlByCacheValue(url, SLIDES_TEMPLATE_IMAGE_CACHE_VALUE)
}

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
			en_US: "Use slide template: {preset_value}",
		},
		options: [],
	},
	{
		data_key: "pages",
		label: { zh_CN: "页数", en_US: "Pages" },
		default_value: "",
		custom_input: {
			type: "number",
			min: 1,
			step: 1,
			integer: true,
			placeholder: { zh_CN: "请输入页数", en_US: "Enter pages" },
			unit: { zh_CN: "页", en_US: "pages" },
		},
		options: [
			{ value: "1-5", label: "1-5" },
			{ value: "6-10", label: "6-10" },
			{ value: "10+", label: "10+" },
		],
	},
	{
		data_key: "size",
		label: { zh_CN: "尺寸", en_US: "Size" },
		default_value: "",
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

export function groupSlidesTemplates(
	templates: SlidesTemplateItem[],
	categories?: SlidesTemplateCategoryItem[],
	tags?: SlidesTemplateTagItem[],
): OptionGroup[] {
	const groups: OptionGroup[] = [createAllSlidesTemplateGroup(templates)]

	if (tags || categories) {
		return [
			...groups,
			// 运营标签组的子标签直接作为一级筛选项展示，例如「精选」「免费」。
			...(tags ? groupSlidesTemplatesByTag(templates, tags) : []),
			...(categories ? groupSlidesTemplatesByCategory(templates, categories) : []),
		]
	}

	const officialTemplates = templates.filter((template) => template.is_official)
	const organizationTemplates = templates.filter((template) => !template.is_official)

	if (officialTemplates.length) {
		groups.push({
			group_key: "official",
			group_name: { zh_CN: "官方模板", en_US: "Official Templates" },
			children: officialTemplates.map(toTemplateOption),
		})
	}

	if (organizationTemplates.length) {
		groups.push({
			group_key: "organization",
			group_name: { zh_CN: "组织模板", en_US: "Organization Templates" },
			children: organizationTemplates.map(toTemplateOption),
		})
	}

	return groups
}

function createAllSlidesTemplateGroup(templates: SlidesTemplateItem[]): OptionGroup {
	return {
		group_key: ALL_SLIDES_TEMPLATE_GROUP_KEY,
		group_name: { zh_CN: "全部", en_US: "All" },
		children: templates.map(toTemplateOption),
	}
}

export function createSlidesTemplateCategoryGroupKey(code: string) {
	return `${SLIDES_TEMPLATE_CATEGORY_GROUP_KEY_PREFIX}${code}`
}

export function createSlidesTemplateTagGroupKey(code: string) {
	return `${SLIDES_TEMPLATE_TAG_GROUP_KEY_PREFIX}${code}`
}

export function getSlidesTemplateCategoryCodeFromGroupKey(groupKey: string) {
	return groupKey.startsWith(SLIDES_TEMPLATE_CATEGORY_GROUP_KEY_PREFIX)
		? groupKey.slice(SLIDES_TEMPLATE_CATEGORY_GROUP_KEY_PREFIX.length)
		: undefined
}

export function getSlidesTemplateTagCodeFromGroupKey(groupKey: string) {
	return groupKey.startsWith(SLIDES_TEMPLATE_TAG_GROUP_KEY_PREFIX)
		? groupKey.slice(SLIDES_TEMPLATE_TAG_GROUP_KEY_PREFIX.length)
		: undefined
}

function groupSlidesTemplatesByTag(
	templates: SlidesTemplateItem[],
	tags: SlidesTemplateTagItem[],
): OptionGroup[] {
	return tags.map((tag) => ({
		group_key: createSlidesTemplateTagGroupKey(tag.code),
		group_name: tag.name_i18n,
		children: templates
			.filter((template) =>
				template.tags?.some((templateTag) => templateTag.code === tag.code),
			)
			.map(toTemplateOption),
	}))
}

function groupSlidesTemplatesByCategory(
	templates: SlidesTemplateItem[],
	categories: SlidesTemplateCategoryItem[],
): OptionGroup[] {
	const groups: OptionGroup[] = []
	const groupedTemplateCodes = new Set<string>()

	categories.forEach((category) => {
		const children = templates
			.filter((template) => template.category_code === category.code)
			.map(toTemplateOption)

		children.forEach((child) => groupedTemplateCodes.add(String(child.value)))
		groups.push({
			group_key: createSlidesTemplateCategoryGroupKey(category.code),
			group_name: category.name_i18n,
			children,
		})
	})

	const otherTemplates = categories.length
		? templates.filter((template) => !groupedTemplateCodes.has(template.code))
		: []
	if (otherTemplates.length) {
		groups.push({
			group_key: OTHER_SLIDES_TEMPLATE_GROUP_KEY,
			group_name: { zh_CN: "其他", en_US: "Other" },
			children: otherTemplates.map(toTemplateOption),
		})
	}

	return groups
}

export function createSlidesPresetPanelConfig(
	templates: SlidesTemplateItem[],
	categories?: SlidesTemplateCategoryItem[],
	tags?: SlidesTemplateTagItem[],
): FieldPanelConfig {
	const groups = groupSlidesTemplates(templates, categories, tags)
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

export function createSlidesFixedSceneConfig(
	templates: SlidesTemplateItem[] = [],
	categories?: SlidesTemplateCategoryItem[],
	tags?: SlidesTemplateTagItem[],
) {
	const panels: SkillPanelConfig[] = [createSlidesPresetPanelConfig(templates, categories, tags)]

	return {
		config: {
			scenes_config: {
				...(panels[0] ? { presets: panels[0] } : {}),
			},
		},
	}
}

export function toTemplateOption(template: SlidesTemplateItem) {
	const isFeatured = template.tags?.some((tag) => tag.code === FEATURED_SLIDES_TEMPLATE_TAG_CODE)
	const imageCacheValue = isFeatured
		? FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_VALUE
		: SLIDES_TEMPLATE_IMAGE_CACHE_VALUE
	const markTemplateImageUrl = (url: string | null | undefined) =>
		markSlidesTemplateImageUrlByCacheValue(url, imageCacheValue)

	return {
		value: template.code,
		label: template.label,
		preset_value: {
			zh_CN: `${template.label.zh_CN}（${template.code}）`,
			en_US: `${template.label.en_US} (${template.code})`,
		},
		thumbnail_url: markTemplateImageUrl(template.thumbnail_url) ?? undefined,
		collage_url: markTemplateImageUrl(template.collage_url) ?? undefined,
		// 预览页优先使用逐页图片；缺少逐页图片时不把拼接图当作 PPT 页面。
		preview_image_urls: (template.preview_image_urls ?? []).map(markTemplateImageUrl),
		description: template.description,
		preview_url: template.preview_url ?? undefined,
		usage_count: template.usage_count ?? 0,
		sort: template.sort,
		colors: template.colors ?? [],
		tags: template.tags ?? [],
		preview_title: {
			zh_CN: `${template.label.zh_CN}预览`,
			en_US: `${template.label.en_US} Preview`,
		},
	}
}

export function buildSlidesTemplatePresetContent(
	template?: OptionItem | null,
): JSONContent | undefined {
	if (!template) return undefined

	const currentValue = localeTextToDisplayString(template.value)
	if (!currentValue) return undefined

	return buildConcatenatedPresetContent([
		{
			...slidesStaticFields[0]!,
			current_value: currentValue,
			options: [template],
		},
	])
}

export const slidesFixedSceneConfig = createSlidesFixedSceneConfig([])
