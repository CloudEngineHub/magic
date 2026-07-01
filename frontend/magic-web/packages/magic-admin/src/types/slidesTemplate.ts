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
		label: LangText
		description: LangText
		thumbnail_file_key: string
		thumbnail_url?: string | null
		collage_file_key?: string | null
		collage_url?: string | null
		template_file_key: string
		template_file_url?: string | null
		preview_url?: string | null
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
		status?: Status | null
	}

	export interface SaveParams {
		label: LangText
		description: LangText
		thumbnail_file_key: string
		collage_file_key?: string | null
		template_file_key: string
		preview_url?: string | null
		status?: Status
		sort?: number
	}
}
