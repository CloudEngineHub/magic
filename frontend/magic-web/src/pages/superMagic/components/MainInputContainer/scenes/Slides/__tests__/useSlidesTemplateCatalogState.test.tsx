import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import {
	SLIDES_TEMPLATE_IMAGE_PROCESS,
	SLIDES_TEMPLATE_PAGE_SIZE,
	createSlidesTemplateCategoryGroupKey,
	createSlidesTemplateTagGroupKey,
	type SlidesTemplateCategoryItem,
	type SlidesTemplateItem,
	type SlidesTemplateTagItem,
} from "../slidesTemplateState"
import { useSlidesTemplateCatalogState } from "../useSlidesTemplateCatalogState"

const apiMock = vi.hoisted(() => ({
	getSlidesTemplateCategories: vi.fn(),
	getSlidesTemplateTags: vi.fn(),
	getSlidesTemplates: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: apiMock,
}))

const slidesTemplateImageOptions = {
	xMagicImageProcess: SLIDES_TEMPLATE_IMAGE_PROCESS,
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

const featuredTag: SlidesTemplateTagItem = {
	id: "tag-1",
	code: "featured",
	name_i18n: {
		zh_CN: "精选",
		en_US: "Featured",
	},
	sort: 100,
	template_count: 1,
	is_official: true,
}

const businessTemplate: SlidesTemplateItem = {
	code: "PPT-business",
	source_type: "OFFICIAL",
	category_code: businessCategory.code,
	label: {
		zh_CN: "商务模板",
		en_US: "Business Template",
	},
	description: {
		zh_CN: "商务模板描述",
		en_US: "Business template description",
	},
	sort: 100,
	is_official: true,
	tags: [
		{
			id: featuredTag.id,
			code: featuredTag.code,
			name_i18n: featuredTag.name_i18n,
			sort: featuredTag.sort,
		},
	],
}

const educationTemplate: SlidesTemplateItem = {
	...businessTemplate,
	code: "PPT-education",
	category_code: "PPT-CATE-education",
	label: {
		zh_CN: "教育模板",
		en_US: "Education Template",
	},
}

describe("useSlidesTemplateCatalogState", () => {
	it("supports a larger page size for the full-screen canvas", async () => {
		vi.mocked(SuperMagicApi.getSlidesTemplates).mockResolvedValue({
			list: [],
			page: 1,
			page_size: 40,
			total: 0,
		})

		renderHook(() => useSlidesTemplateCatalogState({ pageSize: 40 }))

		await waitFor(() => {
			expect(SuperMagicApi.getSlidesTemplates).toHaveBeenCalledWith(
				expect.objectContaining({ page: 1, page_size: 40 }),
				expect.anything(),
			)
		})
	})

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.getSlidesTemplateCategories).mockResolvedValue({
			page: 1,
			page_size: 200,
			total: 1,
			list: [businessCategory],
		})
		vi.mocked(SuperMagicApi.getSlidesTemplateTags).mockResolvedValue({
			page: 1,
			page_size: 200,
			total: 1,
			list: [featuredTag],
		})
		vi.mocked(SuperMagicApi.getSlidesTemplates).mockResolvedValue({
			page: 1,
			page_size: SLIDES_TEMPLATE_PAGE_SIZE,
			total: 1,
			list: [businessTemplate],
		})
	})

	it("loads initial templates and exposes catalog groups", async () => {
		const { result } = renderHook(() => useSlidesTemplateCatalogState())

		await waitFor(() => expect(result.current.isLoading).toBe(false))
		await waitFor(() =>
			expect(
				result.current.groups.some(
					(group) =>
						group.group_key ===
						createSlidesTemplateCategoryGroupKey(businessCategory.code),
				),
			).toBe(true),
		)
		await waitFor(() =>
			expect(
				result.current.groups.some(
					(group) =>
						group.group_key === createSlidesTemplateTagGroupKey(featuredTag.code),
				),
			).toBe(true),
		)

		expect(SuperMagicApi.getSlidesTemplates).toHaveBeenCalledWith(
			{
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
			},
			slidesTemplateImageOptions,
		)
		expect(SuperMagicApi.getSlidesTemplateTags).toHaveBeenCalledWith({
			page: 1,
			page_size: 200,
		})
		expect(result.current.templateOptions.map((template) => template.value)).toEqual([
			businessTemplate.code,
		])
		expect(result.current.groups.map((group) => group.group_key)).toEqual([
			"all",
			createSlidesTemplateTagGroupKey(featuredTag.code),
			createSlidesTemplateCategoryGroupKey(businessCategory.code),
		])
	})

	it("replaces results after category and keyword changes", async () => {
		vi.mocked(SuperMagicApi.getSlidesTemplates)
			.mockResolvedValueOnce({
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				total: 1,
				list: [businessTemplate],
			})
			.mockResolvedValueOnce({
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				total: 1,
				list: [educationTemplate],
			})
			.mockResolvedValueOnce({
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				total: 1,
				list: [businessTemplate],
			})

		const { result } = renderHook(() => useSlidesTemplateCatalogState())

		await waitFor(() => expect(result.current.isLoading).toBe(false))
		await waitFor(() =>
			expect(
				result.current.groups.some(
					(group) =>
						group.group_key ===
						createSlidesTemplateCategoryGroupKey(businessCategory.code),
				),
			).toBe(true),
		)

		act(() => {
			result.current.setSelectedGroupKey(
				createSlidesTemplateCategoryGroupKey(businessCategory.code),
			)
		})

		await waitFor(() =>
			expect(result.current.templateOptions.map((template) => template.value)).toEqual([
				educationTemplate.code,
			]),
		)
		expect(SuperMagicApi.getSlidesTemplates).toHaveBeenLastCalledWith(
			{
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				category_code: businessCategory.code,
			},
			slidesTemplateImageOptions,
		)

		act(() => {
			result.current.setKeyword(" business ")
		})

		await waitFor(
			() =>
				expect(SuperMagicApi.getSlidesTemplates).toHaveBeenLastCalledWith(
					{
						page: 1,
						page_size: SLIDES_TEMPLATE_PAGE_SIZE,
						category_code: businessCategory.code,
						keyword: "business",
					},
					slidesTemplateImageOptions,
				),
			{ timeout: 1000 },
		)
		await waitFor(() =>
			expect(result.current.templateOptions.map((template) => template.value)).toEqual([
				businessTemplate.code,
			]),
		)
	})

	it("queries templates by selected tag", async () => {
		vi.mocked(SuperMagicApi.getSlidesTemplates)
			.mockResolvedValueOnce({
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				total: 1,
				list: [businessTemplate],
			})
			.mockResolvedValueOnce({
				page: 1,
				page_size: SLIDES_TEMPLATE_PAGE_SIZE,
				total: 1,
				list: [businessTemplate],
			})

		const { result } = renderHook(() => useSlidesTemplateCatalogState())

		await waitFor(() => expect(result.current.isLoading).toBe(false))
		await waitFor(() =>
			expect(
				result.current.groups.some(
					(group) =>
						group.group_key === createSlidesTemplateTagGroupKey(featuredTag.code),
				),
			).toBe(true),
		)

		act(() => {
			result.current.setSelectedGroupKey(createSlidesTemplateTagGroupKey(featuredTag.code))
		})

		await waitFor(() =>
			expect(SuperMagicApi.getSlidesTemplates).toHaveBeenLastCalledWith(
				{
					page: 1,
					page_size: SLIDES_TEMPLATE_PAGE_SIZE,
					tag_codes: [featuredTag.code],
					tag_match: "any",
				},
				slidesTemplateImageOptions,
			),
		)
	})
})
