import { useMemo, useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { JSONContent } from "@tiptap/core"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { getPromptRichTextPlainText } from "../../../panels/promptRichText"
import type { OptionItem } from "../../../panels/types"
import { ScenePanelVariant } from "../../../components/LazyScenePanel/types"
import SlidesTemplatePanel from "../SlidesTemplatePanel"
import SlidesTemplatePanelContent from "../SlidesTemplatePanelContent"
import SlidesTemplateHomeSelectionPreview from "../SlidesTemplateHomeSelectionPreview"
import {
	createSlidesTemplateCategoryGroupKey,
	createSlidesPresetPanelConfig,
	type SlidesTemplateCategoryItem,
	type SlidesTemplateItem,
	type SlidesTemplateTagGroupItem,
} from "../slidesTemplateState"
import type { SlidesTemplatePanelState } from "../useSlidesTemplatePanelState"

const apiMock = vi.hoisted(() => ({
	getSlidesTemplateCategories: vi.fn(),
	getSlidesTemplateTagGroups: vi.fn(),
	getSlidesTemplateCount: vi.fn(),
	getSlidesTemplateDetail: vi.fn(),
	getSlidesTemplates: vi.fn(),
}))

const sceneStateStoreMock = vi.hoisted(() => ({
	inputScopeKey: "",
	sendCount: 0,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: apiMock,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { count?: string }) =>
			key === "playbook.edit.presets.templateCount" ? `${options?.count} 套` : key,
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
	useOptionalSceneStateStore: () => sceneStateStoreMock,
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
		hasAnyTemplate: true,
		hasCheckedAnyTemplate: true,
		hasMore: false,
		isLoading: false,
		isRefreshing: false,
		isLoadingMore: false,
		isLoadMoreFailed: false,
		keyword: "",
		loadedTemplateCount: 0,
		loadMore: vi.fn(),
		loadTemplateDetail: vi.fn(),
		retryLoadMore: vi.fn(),
		selectedCategoryCode: undefined,
		selectedChildTagCodes: [],
		selectedGroupKey: "all",
		setKeyword: vi.fn(),
		setSelectedChildTagCodes: vi.fn(),
		setSelectedGroupKey: vi.fn(),
		tagGroups: [],
		templateOptions: [],
		total: 0,
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
		sceneStateStoreMock.inputScopeKey = ""
		sceneStateStoreMock.sendCount = 0
		vi.mocked(SuperMagicApi.getSlidesTemplateCategories).mockResolvedValue({
			page: 1,
			page_size: 200,
			total: 1,
			list: [businessCategory],
		})
		vi.mocked(SuperMagicApi.getSlidesTemplateTagGroups).mockResolvedValue([])
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
				screen.getByTestId(
					`template-group-selector-option-${createSlidesTemplateCategoryGroupKey(
						businessCategory.code,
					)}`,
				),
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
			expect(getPromptRichTextPlainText(lastContent)).toBe(
				"Use slide template: PPT-business.",
			)
		})
	})

	it("shows the template count instead of the selected template name", async () => {
		render(<SlidesTemplatePanel config={createSlidesPresetPanelConfig([])} />)

		const count = await screen.findByTestId("slides-template-panel-template-count")
		expect(count).toHaveTextContent("1 套")
		fireEvent.click(await screen.findByText("Business Template"))

		expect(count).toHaveTextContent("1 套")
		expect(screen.queryByTestId("slides-template-panel-template-clear-button")).toBeNull()
	})

	it("removes the preset content when a controlled selection is cleared", async () => {
		const handlePresetContentChange = vi.fn()
		const selectedTemplate = {
			value: businessTemplate.code,
			label: businessTemplate.label,
			thumbnail_url: businessTemplate.thumbnail_url ?? undefined,
		}
		const { rerender } = render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				selectedTemplate={selectedTemplate}
				onPresetContentChange={handlePresetContentChange}
			/>,
		)

		await waitFor(() => {
			const contentCalls = handlePresetContentChange.mock.calls.filter(([content]) =>
				Boolean(content),
			)
			const lastContent = contentCalls.at(-1)?.[0] as JSONContent | undefined
			expect(getPromptRichTextPlainText(lastContent)).toBe(
				"Use slide template: PPT-business.",
			)
		})

		rerender(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				selectedTemplate={null}
				onPresetContentChange={handlePresetContentChange}
			/>,
		)

		await waitFor(() => {
			expect(handlePresetContentChange.mock.calls.at(-1)?.[0]).toBeUndefined()
		})
	})

	it("shows selected page, size, and language values in the home selection preview", () => {
		render(
			<SlidesTemplateHomeSelectionPreview
				template={{ value: "woodland", label: "Woodland Storybook" }}
				filters={[
					{
						data_key: "pages",
						label: "页数",
						current_value: "6-10",
						options: [{ value: "6-10", label: "6-10" }],
					},
					{
						data_key: "size",
						label: "尺寸",
						current_value: "16:9",
						options: [{ value: "16:9", label: "16:9" }],
					},
					{
						data_key: "language",
						label: "语言",
						current_value: "zh",
						options: [{ value: "zh", label: "中文" }],
					},
				]}
				onClear={vi.fn()}
				onFilterChange={vi.fn()}
			/>,
		)

		expect(screen.getByText("页数")).toBeInTheDocument()
		expect(screen.getByText("6-10")).toBeInTheDocument()
		expect(screen.getByText("尺寸")).toBeInTheDocument()
		expect(screen.getByText("16:9")).toBeInTheDocument()
		expect(screen.getByText("语言")).toBeInTheDocument()
		expect(screen.getByText("中文")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("slides-template-home-preview-selected-template"))
		expect(screen.getByTestId("slides-preset-preview-dialog-content")).toBeInTheDocument()
	})

	it("shows the AI automatic template placeholder when no template is selected", async () => {
		render(<SlidesTemplateHomeSelectionPreview filters={[]} onFilterChange={vi.fn()} />)

		expect(
			screen.getByText("playbook.edit.presets.form.autoSelectTemplate"),
		).toBeInTheDocument()
		expect(screen.getByText("playbook.edit.presets.form.autoSelectTemplate")).toHaveClass(
			"whitespace-normal",
		)
		expect(screen.queryByTestId("slides-template-home-clear-selected-template")).toBeNull()

		render(
			<SlidesTemplateHomeSelectionPreview
				filters={[]}
				onFilterChange={vi.fn()}
				onTemplatePickerContainerChange={vi.fn()}
			/>,
		)
		const chooseTemplateButton = screen
			.getAllByTestId("slides-template-home-choose-template")
			.at(-1)
		expect(chooseTemplateButton).toBeDefined()
		expect(chooseTemplateButton).toHaveAttribute("aria-haspopup", "menu")
	})

	it("does not mount the template dropdown until the clear click has completed", async () => {
		function SelectionPreview() {
			const [template, setTemplate] = useState<OptionItem | null>({
				value: "woodland",
				label: "Woodland Storybook",
			})

			return (
				<SlidesTemplateHomeSelectionPreview
					template={template}
					filters={[]}
					onClear={() => setTemplate(null)}
					onFilterChange={vi.fn()}
					onTemplatePickerContainerChange={vi.fn()}
				/>
			)
		}

		render(<SelectionPreview />)

		const clearButton = screen.getByTestId("slides-template-home-clear-selected-template")
		fireEvent.pointerDown(clearButton)
		fireEvent.click(clearButton)

		expect(screen.queryByTestId("slides-template-home-choose-template")).toBeNull()
		expect(await screen.findByTestId("slides-template-home-choose-template")).toHaveAttribute(
			"aria-expanded",
			"false",
		)
	})

	it("hides the topic template selector and portals its live dropdown content", async () => {
		const templatePickerContainer = document.createElement("div")
		document.body.append(templatePickerContainer)
		const { unmount } = render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				variant={ScenePanelVariant.TopicPage}
				hideTemplateSelector
				templatePickerContainer={templatePickerContainer}
			/>,
		)

		expect(screen.queryByTestId("slides-template-floating-selector-trigger")).toBeNull()
		expect(await screen.findByTestId("slides-preset-grid")).toHaveClass("2xl:!grid-cols-4")
		unmount()
		templatePickerContainer.remove()
	})

	it("shows only the template list in the home panel", async () => {
		render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				variant={ScenePanelVariant.HomePage}
			/>,
		)

		const toolbar = await screen.findByTestId("slides-template-panel-toolbar")
		expect(toolbar).toHaveClass("sticky", "top-0", "z-50", "bg-background/95", "backdrop-blur")
		expect(screen.queryByTestId("slides-template-panel-template-count")).toBeNull()
	})

	it("does not render when there are no templates", async () => {
		vi.mocked(SuperMagicApi.getSlidesTemplates).mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 0,
			list: [],
		})

		const { container } = render(
			<SlidesTemplatePanel config={createSlidesPresetPanelConfig([])} />,
		)

		await waitFor(() => expect(SuperMagicApi.getSlidesTemplates).toHaveBeenCalled())
		await waitFor(() => expect(container).toBeEmptyDOMElement())
	})

	it("does not render when the first page list is empty even if total is non-zero", async () => {
		vi.mocked(SuperMagicApi.getSlidesTemplates).mockResolvedValue({
			page: 1,
			page_size: 20,
			total: 1,
			list: [],
		})

		const { container } = render(
			<SlidesTemplatePanel config={createSlidesPresetPanelConfig([])} />,
		)

		await waitFor(() => expect(SuperMagicApi.getSlidesTemplates).toHaveBeenCalled())
		await waitFor(() => expect(container).toBeEmptyDOMElement())
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
		fireEvent.click(screen.getByText("Business Template"))

		expect(trigger).toHaveTextContent("Business Template")
		expect(trigger).not.toHaveTextContent("101,582 套")
	})

	it("发送后再次选择模板时不会被旧的发送状态清空", async () => {
		function ControlledTopicTemplatePanel() {
			const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)
			const config = useMemo(() => createSlidesPresetPanelConfig([]), [])

			return (
				<SlidesTemplatePanel
					config={config}
					variant={ScenePanelVariant.TopicPage}
					selectedTemplate={selectedTemplate}
					onTemplateSelect={(template) => setSelectedTemplate(template)}
				/>
			)
		}

		const { rerender } = render(<ControlledTopicTemplatePanel />)
		const trigger = await screen.findByTestId("slides-template-floating-selector-trigger")

		// 模拟一次已完成发送，面板应清空当次选择。
		sceneStateStoreMock.sendCount = 1
		rerender(<ControlledTopicTemplatePanel />)

		fireEvent.pointerDown(trigger)
		fireEvent.click(trigger)
		fireEvent.click(await screen.findByText("Business Template"))

		await waitFor(() => expect(trigger).toHaveTextContent("Business Template"))
	})

	it("keeps mobile compact selector and filters on the same row", async () => {
		render(
			<SlidesTemplatePanel
				config={createSlidesPresetPanelConfig([])}
				variant={ScenePanelVariant.Mobile}
				compact
			/>,
		)

		const trigger = await screen.findByTestId("slides-template-floating-selector-trigger")
		const scrollItemContainer = trigger.parentElement
		const filterTriggers = await screen.findAllByTestId("mobile-scene-panel-filter-trigger")

		expect(scrollItemContainer).toHaveClass("flex")
		expect(scrollItemContainer).not.toHaveClass("flex-col")
		expect(scrollItemContainer).not.toHaveClass("block")
		expect(filterTriggers).toHaveLength(3)
		filterTriggers.forEach((filterTrigger) => {
			expect(scrollItemContainer).toContainElement(filterTrigger)
		})
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

	it("renders the business report category in the template selector", () => {
		const businessReportGroupKey = createSlidesTemplateCategoryGroupKey(
			"PPT-CATE-business-report",
		)
		const setSelectedGroupKey = vi.fn()
		render(
			<SlidesTemplatePanelContent
				slidesState={createSlidesTemplatePanelContentState({
					selectedGroupKey: businessReportGroupKey,
					setSelectedGroupKey,
					groups: [
						{ group_key: "all", group_name: "All", children: [] },
						{ group_key: "tag:featured", group_name: "Featured", children: [] },
						{
							group_key: businessReportGroupKey,
							group_name: "Business Report",
							children: [],
						},
					],
				})}
				onTemplateClick={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("template-group-selector-option-all")).toBeInTheDocument()
		expect(
			screen.getByTestId("template-group-selector-option-tag:featured"),
		).toBeInTheDocument()
		const categoryButton = screen.getByTestId(
			`template-group-selector-option-${businessReportGroupKey}`,
		)
		Object.assign(categoryButton, { scrollIntoView: vi.fn() })
		expect(categoryButton).toBeInTheDocument()
		fireEvent.click(categoryButton)
		expect(setSelectedGroupKey).toHaveBeenCalledWith("all")
	})

	it("renders category tags beneath the primary category selector", () => {
		const setSelectedChildTagCodes = vi.fn()
		const tagGroups: SlidesTemplateTagGroupItem[] = [
			{
				id: "purpose-group",
				code: "purpose_group",
				name_i18n: { zh_CN: "用途与交付物", en_US: "Purpose" },
				sort: 100,
				tags: [
					{
						id: "annual-report",
						code: "purpose-annual-report",
						name_i18n: { zh_CN: "年度报告", en_US: "Annual Report" },
						sort: 100,
						template_count: 1,
						is_official: true,
					},
				],
			},
			{
				id: "style-group",
				code: "style_group",
				name_i18n: { zh_CN: "视觉风格", en_US: "Style" },
				sort: 90,
				tags: [
					{
						id: "business-style",
						code: "style-business",
						name_i18n: { zh_CN: "商务", en_US: "Business" },
						sort: 90,
						template_count: 1,
						is_official: true,
					},
				],
			},
		]

		render(
			<SlidesTemplatePanelContent
				slidesState={createSlidesTemplatePanelContentState({
					selectedCategoryCode: businessCategory.code,
					selectedChildTagCodes: ["purpose-annual-report"],
					tagGroups,
					setSelectedChildTagCodes,
				})}
				onTemplateClick={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("slides-template-category-tag-filters")).toBeInTheDocument()
		expect(screen.getByText("Purpose")).toBeInTheDocument()
		expect(screen.queryByText("Style")).not.toBeInTheDocument()

		const toggle = screen.getByTestId("slides-template-tag-groups-toggle")
		expect(toggle).toHaveAttribute("aria-expanded", "false")
		fireEvent.click(toggle)
		expect(screen.getByText("Style")).toBeInTheDocument()
		expect(toggle).toHaveAttribute("aria-expanded", "true")
		fireEvent.click(screen.getByTestId("slides-template-tag-option-style-business"))
		expect(setSelectedChildTagCodes).toHaveBeenCalledWith([
			"purpose-annual-report",
			"style-business",
		])
		setSelectedChildTagCodes.mockClear()
		fireEvent.click(toggle)
		expect(screen.queryByText("Style")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("slides-template-tag-option-purpose-annual-report"))
		expect(setSelectedChildTagCodes).toHaveBeenCalledWith([])
	})

	it("hides the toolbar without an exit transition while preview is open", async () => {
		render(
			<SlidesTemplatePanelContent
				slidesState={createSlidesTemplatePanelContentState({
					templateOptions: [
						{
							value: "business",
							label: "Business Template",
							thumbnail_url: "https://example.com/business.png",
							preview_image_urls: [
								"https://example.com/business-page-1.png",
								"https://example.com/business-page-2.png",
							],
							preview_title: "Business Preview",
						},
					],
				})}
				onTemplateClick={vi.fn()}
			/>,
		)

		const toolbar = screen.getByTestId("slides-template-panel-toolbar")
		expect(toolbar).toHaveClass("translate-y-0")
		expect(toolbar).toHaveClass("opacity-100")
		expect(toolbar).not.toHaveClass("transition-[opacity,transform]")
		expect(toolbar).not.toHaveClass("duration-300")

		fireEvent.click(screen.getByTestId("slides-preset-card-touch-preview-button"))

		await waitFor(() => {
			expect(toolbar).toHaveClass("pointer-events-none")
			expect(toolbar).toHaveClass("translate-y-[calc(100%_+_24px)]")
			expect(toolbar).toHaveClass("opacity-0")
		})

		fireEvent.click(screen.getByTestId("on-open-change"))

		await waitFor(() => {
			expect(toolbar).toHaveClass("translate-y-0")
			expect(toolbar).toHaveClass("opacity-100")
		})
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
