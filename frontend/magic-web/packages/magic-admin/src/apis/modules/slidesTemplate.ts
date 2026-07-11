import type { WithPage } from "@admin/types/common"
import type { SlidesTemplate } from "@admin/types/slidesTemplate"
import { RequestUrl } from "../constant"
import type { HttpClient } from "../core/HttpClient"
import { genRequestUrl } from "../utils"

export const generateSlidesTemplateApi = (client: HttpClient) => ({
	query(params: SlidesTemplate.QueryParams) {
		return client.post<WithPage<SlidesTemplate.Item>>(RequestUrl.querySlidesTemplates, params)
	},

	detail(id: string) {
		return client.get<SlidesTemplate.Item>(genRequestUrl(RequestUrl.getSlidesTemplate, { id }))
	},

	create(data: SlidesTemplate.SaveParams) {
		return client.post<SlidesTemplate.Item>(RequestUrl.createSlidesTemplate, data)
	},

	update(id: string, data: SlidesTemplate.SaveParams) {
		return client.put<SlidesTemplate.Item>(
			genRequestUrl(RequestUrl.updateSlidesTemplate, { id }),
			data,
		)
	},

	updateStatus(id: string, status: SlidesTemplate.Status) {
		return client.put<[]>(genRequestUrl(RequestUrl.updateSlidesTemplateStatus, { id }), {
			status,
		})
	},

	updateSort(id: string, sort: number) {
		return client.put<[]>(genRequestUrl(RequestUrl.updateSlidesTemplateSort, { id }), {
			sort,
		})
	},

	delete(id: string) {
		return client.delete<[]>(genRequestUrl(RequestUrl.deleteSlidesTemplate, { id }))
	},

	updateTags(id: string, data: SlidesTemplate.UpdateTemplateTagsParams) {
		return client.put<SlidesTemplate.Item>(
			genRequestUrl(RequestUrl.updateSlidesTemplateTags, { id }),
			data,
		)
	},

	category: {
		query(params: SlidesTemplate.CategoryQueryParams) {
			return client.post<WithPage<SlidesTemplate.CategoryItem>>(
				RequestUrl.querySlidesTemplateCategories,
				params,
			)
		},

		detail(id: string) {
			return client.get<SlidesTemplate.CategoryItem>(
				genRequestUrl(RequestUrl.getSlidesTemplateCategory, { id }),
			)
		},

		create(data: SlidesTemplate.CategorySaveParams) {
			return client.post<SlidesTemplate.CategoryItem>(
				RequestUrl.createSlidesTemplateCategory,
				data,
			)
		},

		update(id: string, data: SlidesTemplate.CategorySaveParams) {
			return client.put<SlidesTemplate.CategoryItem>(
				genRequestUrl(RequestUrl.updateSlidesTemplateCategory, { id }),
				data,
			)
		},

		updateStatus(id: string, status: SlidesTemplate.Status) {
			return client.put<[]>(
				genRequestUrl(RequestUrl.updateSlidesTemplateCategoryStatus, { id }),
				{ status },
			)
		},

		updateSort(id: string, sort: number) {
			return client.put<[]>(
				genRequestUrl(RequestUrl.updateSlidesTemplateCategorySort, { id }),
				{
					sort,
				},
			)
		},

		delete(id: string) {
			return client.delete<[]>(genRequestUrl(RequestUrl.deleteSlidesTemplateCategory, { id }))
		},
	},

	tag: {
		query(params: SlidesTemplate.TagQueryParams) {
			return client.post<WithPage<SlidesTemplate.TagItem>>(
				RequestUrl.querySlidesTemplateTags,
				params,
			)
		},

		detail(id: string) {
			return client.get<SlidesTemplate.TagItem>(
				genRequestUrl(RequestUrl.getSlidesTemplateTag, { id }),
			)
		},

		create(data: SlidesTemplate.TagSaveParams) {
			return client.post<SlidesTemplate.TagItem>(RequestUrl.createSlidesTemplateTag, data)
		},

		update(id: string, data: SlidesTemplate.TagSaveParams) {
			return client.put<SlidesTemplate.TagItem>(
				genRequestUrl(RequestUrl.updateSlidesTemplateTag, { id }),
				data,
			)
		},

		updateStatus(id: string, status: SlidesTemplate.Status) {
			return client.put<[]>(genRequestUrl(RequestUrl.updateSlidesTemplateTagStatus, { id }), {
				status,
			})
		},

		updateSort(id: string, sort: number) {
			return client.put<[]>(genRequestUrl(RequestUrl.updateSlidesTemplateTagSort, { id }), {
				sort,
			})
		},

		delete(id: string) {
			return client.delete<[]>(genRequestUrl(RequestUrl.deleteSlidesTemplateTag, { id }))
		},
	},
})
