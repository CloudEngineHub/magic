import type { PageParams } from "./common"

export namespace SlidesTemplate {
	export type LangText = {
		zh_CN: string
		en_US: string
	}

	export const StatusMap = {
		disabled: 0,
		enabled: 1,
	} as const
	export type Status = (typeof StatusMap)[keyof typeof StatusMap]

	export const SourceTypeMap = {
		system: "SYSTEM",
		official: "OFFICIAL",
	} as const
	export type SourceType = (typeof SourceTypeMap)[keyof typeof SourceTypeMap]

	export interface Item {
		id: string
		organization_code: string
		code: string
		source_type?: SourceType
		category_code?: string | null
		category?: CategoryItem | null
		tags?: TagItem[]
		label: LangText
		description: LangText
		thumbnail_file_key: string
		thumbnail_url?: string | null
		colors?: string[]
		collage_file_key?: string | null
		collage_url?: string | null
		preview_image_file_keys?: string[]
		preview_image_urls?: string[]
		template_file_key: string
		template_file_url?: string | null
		preview_url?: string | null
		usage_count?: number
		base_usage_count?: number
		actual_usage_count?: number
		status: Status
		sort: number
		created_uid?: string
		updated_uid?: string
		created_at?: string
		updated_at?: string
	}

	export interface QueryParams extends PageParams {
		keyword?: string
		code?: string
		category_code?: string
		tag_codes?: string[]
		tag_match?: TagMatch
		status?: Status | null
	}

	export interface SaveParams {
		code?: string
		category_code?: string | null
		label: LangText
		description: LangText
		thumbnail_file_key: string
		collage_file_key?: string | null
		preview_image_file_keys?: string[]
		template_file_key: string
		preview_url?: string | null
		tag_codes?: string[]
		status?: Status
		sort?: number
	}

	export type TagMatch = "any" | "all"
	/** 标签组仅用于管理和展示；模板只能绑定子标签。 */
	export type TagNodeType = "group" | "tag"

	export interface CategoryItem {
		id: string
		organization_code: string
		code: string
		name_i18n: LangText
		sort: number
		template_count: number
		is_official: boolean
		status: Status
		created_uid?: string
		updated_uid?: string
		created_at?: string
		updated_at?: string
	}

	export interface CategoryQueryParams extends PageParams {
		keyword?: string
		code?: string
		status?: Status | null
	}

	export interface CategorySaveParams {
		name_i18n: LangText
		status?: Status
		sort?: number
	}

	export interface TagItem {
		id: string
		organization_code: string
		code: string
		name_i18n: LangText
		description_i18n?: LangText
		parent_id: string | number
		node_type: TagNodeType
		sort: number
		template_count: number
		is_official: boolean
		status: Status
		created_uid?: string
		updated_uid?: string
		created_at?: string
		updated_at?: string
		children?: TagItem[]
	}

	export interface TagQueryParams extends PageParams {
		keyword?: string
		code?: string
		node_type?: TagNodeType
		parent_id?: string | number
		status?: Status | null
	}

	export interface TagSaveParams {
		code: string
		node_type: TagNodeType
		parent_id: string | number
		name_i18n: LangText
		description_i18n?: LangText
		status?: Status
		sort?: number
	}

	export interface UpdateTemplateTagsParams {
		tag_codes?: string[]
	}
}
