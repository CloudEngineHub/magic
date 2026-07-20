import { customAlphabet } from "nanoid"
import { SlidesTemplate } from "../../../types/slidesTemplate"

/**
 * 后端 code 正则：^PPT-[A-Za-z0-9]+(-[A-Za-z0-9]+)*$
 * 避开 nanoid 默认字典中的 "_"、"-"，仅使用字母数字，
 * 保证单独一个原子即可通过正则校验且唯一性足够强。
 */
const UPPERCASE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const LOWERCASE_ALPHABET = UPPERCASE_ALPHABET.toLowerCase()
const DIGIT_ALPHABET = "0123456789"
const SLIDES_TEMPLATE_CODE_ALPHABET = [UPPERCASE_ALPHABET, LOWERCASE_ALPHABET, DIGIT_ALPHABET].join(
	"",
)
const SLIDES_TEMPLATE_CODE_LENGTH = 12
export const FEATURED_SLIDES_TEMPLATE_TAG_CODE = "featured"
export const SYSTEM_SLIDES_TEMPLATE_TAG_GROUP_CODE = "operational_group"
export const SLIDES_TEMPLATE_TAG_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN = /^[a-z0-9]+([_-][a-z0-9]+)*_group$/
const generateCodeSegment = customAlphabet(
	SLIDES_TEMPLATE_CODE_ALPHABET,
	SLIDES_TEMPLATE_CODE_LENGTH,
)

/**
 * 生成新的 PPT 模板 code（仅用于新建模板）。
 * 形如 `PPT-xxxxxxxxxxxx`，满足后端校验且具备近乎零冲突的随机性，
 * 冲突时由调用方捕获唯一约束错误后重新生成。
 */
export function generateSlidesTemplateCode(): string {
	return `PPT-${generateCodeSegment()}`
}

export interface SlidesTemplateFormValues {
	code?: string
	category_code?: string | null
	tag_codes?: string[]
	label: SlidesTemplate.LangText
	description: SlidesTemplate.LangText
	thumbnail_file_key: string
	collage_file_key?: string | null
	preview_image_file_keys?: string[]
	template_file_key: string
	preview_url?: string | null
	status?: boolean
	sort?: number | null
}

export interface SlidesTemplateCategoryFormValues {
	name_i18n: SlidesTemplate.LangText
	status?: boolean
	sort?: number | null
}

export interface SlidesTemplateTagFormValues {
	code: string
	node_type: SlidesTemplate.TagNodeType
	parent_id: string | number
	name_i18n: SlidesTemplate.LangText
	description_i18n?: SlidesTemplate.LangText
	status?: boolean
	sort?: number | null
}

export function resolveSlidesTemplateTitle(record: SlidesTemplate.Item) {
	return record.label?.zh_CN || record.label?.en_US || record.code
}

export function resolveSlidesTemplateCategoryName(record: SlidesTemplate.CategoryItem) {
	return record.name_i18n?.zh_CN || record.name_i18n?.en_US || record.code
}

export function resolveSlidesTemplateTagName(record: SlidesTemplate.TagItem) {
	return record.name_i18n?.zh_CN || record.name_i18n?.en_US || record.code
}

export function getSlidesTemplateStatusByChecked(checked: boolean) {
	return checked ? SlidesTemplate.StatusMap.enabled : SlidesTemplate.StatusMap.disabled
}

export function getSlidesTemplateStatusColor(status: SlidesTemplate.Status) {
	return status === SlidesTemplate.StatusMap.enabled ? "success" : "error"
}

/**
 * 「精选」是普通标签的快捷操作，不单独维护一份状态，避免保存后出现开关与标签不一致。
 */
export function setSlidesTemplateTagEnabled(
	tagCodes: string[] | undefined,
	tagCode: string,
	enabled: boolean,
) {
	const nextTagCodes = Array.from(new Set(tagCodes ?? []))
	const index = nextTagCodes.indexOf(tagCode)

	if (enabled && index === -1) return [...nextTagCodes, tagCode]
	if (!enabled && index !== -1) return nextTagCodes.filter((code) => code !== tagCode)
	return nextTagCodes
}

export function isSystemSlidesTemplate(record: Pick<SlidesTemplate.Item, "source_type">) {
	return record.source_type === SlidesTemplate.SourceTypeMap.system
}

export function isSystemSlidesTemplateTagGroup(
	record: Pick<SlidesTemplate.TagItem, "code" | "node_type">,
) {
	return record.node_type === "group" && record.code === SYSTEM_SLIDES_TEMPLATE_TAG_GROUP_CODE
}

export function joinUploadDir(baseDir: string, suffixDir: string) {
	const normalizedBaseDir = baseDir.endsWith("/") ? baseDir : `${baseDir}/`
	const normalizedSuffixDir = suffixDir.startsWith("/") ? suffixDir.slice(1) : suffixDir

	return `${normalizedBaseDir}${normalizedSuffixDir}`
}

export function buildSlidesTemplateSaveParams(
	values: SlidesTemplateFormValues,
): SlidesTemplate.SaveParams {
	const params: SlidesTemplate.SaveParams = {
		category_code: values.category_code || null,
		label: values.label,
		description: values.description,
		thumbnail_file_key: values.thumbnail_file_key,
		collage_file_key: values.collage_file_key || null,
		preview_image_file_keys: values.preview_image_file_keys ?? [],
		template_file_key: values.template_file_key,
		preview_url: values.preview_url || null,
		status: getSlidesTemplateStatusByChecked(Boolean(values.status)),
		sort: values.sort ?? 0,
	}
	// code 仅在新建模板时由前端注入；编辑模式不应携带 code，由后端保留原值
	if (values.code) params.code = values.code
	if (Array.isArray(values.tag_codes)) params.tag_codes = values.tag_codes
	return params
}

export function buildSlidesTemplateCategorySaveParams(
	values: SlidesTemplateCategoryFormValues,
): SlidesTemplate.CategorySaveParams {
	return {
		name_i18n: values.name_i18n,
		status: getSlidesTemplateStatusByChecked(Boolean(values.status)),
		sort: values.sort ?? 0,
	}
}

export function buildSlidesTemplateTagSaveParams(
	values: SlidesTemplateTagFormValues,
): SlidesTemplate.TagSaveParams {
	return {
		code: values.code.trim(),
		node_type: values.node_type,
		parent_id: values.node_type === "group" ? 0 : values.parent_id,
		name_i18n: values.name_i18n,
		description_i18n: values.description_i18n,
		status: getSlidesTemplateStatusByChecked(Boolean(values.status)),
		sort: values.sort ?? 0,
	}
}
