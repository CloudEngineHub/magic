import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { JSONContent } from "@tiptap/core"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { getPromptRichTextPlainText } from "../../../panels/promptRichText"
import { ScenePanelVariant } from "../../../components/LazyScenePanel/types"
import SlidesTemplatePanel from "../SlidesTemplatePanel"
import SlidesTemplatePanelContent from "../SlidesTemplatePanelContent"
import {
	createSlidesPresetPanelConfig,
	type SlidesTemplateCategoryItem,
	type SlidesTemplateItem,
} from "../slidesTemplateState"
import type { SlidesTemplatePanelState } from "../useSlidesTemplatePanelState"

const apiMock = vi.hoisted(() => ({
	getSlidesTemplateCategories: vi.fn(),
	getSlidesTemplates: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: apiMock,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en_US" },
	}),
}))

vi.mock("i18next", () => ({
	default: {
		language: "en_US",
		resolvedLanguage: "en_US",
		t: (key: string) => key,
	},
	t: (key: string) => key,
}))

vi.mock("../../../stores", () => ({
	useOptionalSceneStateStore: () => null,
}))

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
	thumbnail_url: "https://example.com/business.png",
	sort: 100,
	is_official: true,
}

function createSlidesTemplatePanelContentState(
	overrides: Partial<SlidesTemplatePanelState> = {},
): SlidesTemplatePanelState {
	return {
		groups: [],
		hasMore: false,
		isLoading: false,
		isRefreshing: false,
		isLoadingMore: false,
		keyword: "",
		loadMore: vi.fn(),
		selectedGroupKey: "all",
		setKeyword: vi.fn(),
		setSelectedGroupKey: vi.fn(),
		templateOptions: [],
		...overrides,
	}
}

describe("SlidesTemplatePanel", () => {
	beforeAll(() => {
		vi.stubGlobal(
			"IntersectionObserver",
			vi.fn(() => ({
				disconnect: vi.fn(),
				observe: vi.fn(),
				unobserve: vi.fn(),
			})),
		)
	})

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(SuperMagicApi.getSlidesTemplateCategories).mockResolvedValue({
			page: 1,
			page_size: 200,
			total: 1,
			list: [businessCategory],
		})
		vi.mocked(SuperMagicApi.getSlidesTemplates).mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 1,
			list: [businessTemplate],
		})
	})

	afterAll(() => {
		vi.unstubAllGlobals()
	})

	it("renders groups, toggles search, and writes preset content after selecting a template", async () => {
		const handlePresetContentChange = vi.fn()

		render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				onPresetContentChange={handlePresetContentChange}
			/>,
		)

		await waitFor(() =>
			expect(screen.getByTestId("template-group-selector-option-all")).toBeInTheDocument(),
		)
		expect(screen.queryByTestId("slides-template-search-input")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("slides-template-search-toggle"))
		const searchInput = await screen.findByTestId("slides-template-search-input")
		expect(searchInput).toBeInTheDocument()
		fireEvent.change(searchInput, { target: { value: "business" } })
		expect(searchInput).toHaveValue("business")
		fireEvent.click(screen.getByTestId("slides-template-search-toggle"))
		expect(screen.queryByTestId("slides-template-search-input")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("slides-template-search-toggle"))
		expect(await screen.findByTestId("slides-template-search-input")).toHaveValue("")
		await screen.findByText("Business Template")
		await waitFor(() =>
			expect(
				screen.getByTestId(`template-group-selector-option-${businessCategory.code}`),
			).toBeInTheDocument(),
		)

		act(() => {
			fireEvent.click(screen.getByText("Business Template"))
		})

		await waitFor(() => {
			const contentCalls = handlePresetContentChange.mock.calls.filter(([content]) =>
				Boolean(content),
			)
			const lastContent = contentCalls.at(-1)?.[0] as JSONContent | undefined
			expect(getPromptRichTextPlainText(lastContent)).toBe("Use PPT template: PPT-business.")
		})
	})

	it("keeps topic page selector compact and opens shared template content in a floating panel", async () => {
		render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				variant={ScenePanelVariant.TopicPage}
			/>,
		)

		const trigger = await screen.findByTestId("slides-template-floating-selector-trigger")
		expect(trigger).toBeInTheDocument()
		expect(screen.queryByTestId("slides-template-search-input")).not.toBeInTheDocument()

		fireEvent.pointerDown(trigger)
		fireEvent.click(trigger)

		expect(await screen.findByTestId("slides-template-search-toggle")).toBeInTheDocument()
		expect(screen.queryByTestId("slides-template-search-input")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("slides-template-search-toggle"))
		expect(await screen.findByTestId("slides-template-search-input")).toBeInTheDocument()
		await screen.findByText("Business Template")
	})

	it("expands search input when keyword already exists", () => {
		render(
			<SlidesTemplatePanelContent
				slidesState={createSlidesTemplatePanelContentState({ keyword: "business" })}
				onTemplateClick={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("slides-template-search-input")).toHaveValue("business")
	})

	it("does not update keyword while composing Chinese input", () => {
		const setKeyword = vi.fn()

		render(
			<SlidesTemplatePanelContent
				slidesState={createSlidesTemplatePanelContentState({ setKeyword })}
				onTemplateClick={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("slides-template-search-toggle"))
		const input = screen.getByTestId("slides-template-search-input")

		fireEvent.compositionStart(input)
		fireEvent.change(input, { target: { value: "zhong" } })

		expect(input).toHaveValue("zhong")
		expect(setKeyword).not.toHaveBeenCalled()

		fireEvent.compositionEnd(input)

		expect(setKeyword).toHaveBeenCalledWith("zhong")
	})
})
