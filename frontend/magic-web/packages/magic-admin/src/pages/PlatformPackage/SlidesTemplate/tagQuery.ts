import type { SlidesTemplate } from "@admin/types/slidesTemplate"

interface SlidesTemplateTagFilters {
	keyword?: string
	code?: string
	status?: SlidesTemplate.Status
}

interface BuildSlidesTemplateTagQueryParamsOptions {
	page: number
	pageSize: number
	parentId?: string | number | null
	filters?: SlidesTemplateTagFilters
}

export function buildSlidesTemplateTagQueryParams({
	page,
	pageSize,
	parentId,
	filters = {},
}: BuildSlidesTemplateTagQueryParamsOptions): SlidesTemplate.TagQueryParams {
	return {
		page,
		page_size: pageSize,
		...(parentId === null || parentId === undefined ? {} : { parent_id: parentId }),
		node_type: "tag",
		keyword: filters.keyword?.trim() || undefined,
		code: filters.code?.trim() || undefined,
		status: filters.status ?? null,
	}
}
