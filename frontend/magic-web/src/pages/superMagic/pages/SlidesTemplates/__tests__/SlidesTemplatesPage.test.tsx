import { fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { forwardRef, useImperativeHandle } from "react"
import type {
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplatesPage from "../index"
import {
	preserveExistingTemplateOrder,
	reuseUnchangedTemplateOptions,
	shouldLoadMoreSimilarColorTemplates,
} from "../similarTemplateLoading"

const {
	catalogStateMock,
	businessTemplate,
	findSimilarCallbackHistory,
	focusRandomTemplateMock,
	openPreviewMock,
	relatedTemplate,
	unrelatedTemplate,
} = vi.hoisted(() => {
	const template: OptionItem = {
		value: "PPT-business",
		label: {
			zh_CN: "商务模板",
			en_US: "Business Template",
		},
		thumbnail_url: "https://example.com/business-cover.png",
		colors: ["#315ECA", "#7AA7FF", "#182A5A"],
	}
	const related: OptionItem = {
		value: "PPT-related",
		label: "Related Template",
		colors: ["#365FC2", "#83AEFF", "#26396A"],
	}
	const unrelated: OptionItem = {
		value: "PPT-unrelated",
		label: "Unrelated Template",
		colors: ["#D97706", "#FACC15", "#7C2D12"],
	}
	const groups: OptionGroup[] = [
		{
			group_key: "all",
			group_name: "All",
			children: [template, related, unrelated],
		},
		{
			group_key: "business",
			group_name: "Business",
			children: [template, related, unrelated],
		},
	]

	return {
		businessTemplate: template,
		findSimilarCallbackHistory: [] as Array<((template: OptionItem) => void) | undefined>,
		focusRandomTemplateMock: vi.fn(),
		openPreviewMock: vi.fn(),
		relatedTemplate: related,
		unrelatedTemplate: unrelated,
		catalogStateMock: {
			groups,
			hasAnyTemplate: true,
			hasCheckedAnyTemplate: true,
			hasMore: false,
			isLoading: false,
			isRefreshing: false,
			isLoadingMore: false,
			keyword: "",
			loadedTemplateCount: 3,
			loadMore: vi.fn(),
			selectedGroupKey: "all",
			setKeyword: vi.fn(),
			setSelectedGroupKey: vi.fn(),
			templateOptions: [template, related, unrelated],
		},
	}
})

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string, options?: { name?: string }) => options?.name ?? key,
	}),
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateCatalogState",
	() => ({
		useSlidesTemplateCatalogState: () => catalogStateMock,
	}),
)

vi.mock("../SlidesTemplateCanvas", () => ({
	__esModule: true,
	default: forwardRef(
		(
			{
				hasMore,
				onLoadMore,
				onFindSimilarColors,
				onPreviewOpenChange,
				onTemplateSelect,
				templates,
			}: {
				hasMore: boolean
				onLoadMore: () => void
				onFindSimilarColors?: (template: OptionItem) => void
				onPreviewOpenChange?: (isOpen: boolean) => void
				onTemplateSelect: (template: OptionItem) => void
				templates: OptionItem[]
			},
			ref,
		) => {
			findSimilarCallbackHistory.push(onFindSimilarColors)
			useImperativeHandle(ref, () => ({
				focusRandomTemplate: focusRandomTemplateMock,
				openPreview: openPreviewMock,
			}))
			return (
				<>
					<button
						type="button"
						data-testid="mock-slides-template-canvas"
						onClick={() => onTemplateSelect(businessTemplate)}
					>
						canvas
					</button>
					<div
						data-testid="mock-slides-template-canvas-options"
						data-has-more={String(hasMore)}
					>
						{templates.map((template) => String(template.value)).join(",")}
					</div>
					<button
						type="button"
						data-testid="mock-slides-template-canvas-load-more"
						onClick={onLoadMore}
					>
						load more
					</button>
					<button
						type="button"
						data-testid="mock-slides-template-find-similar-colors"
						onClick={() => onFindSimilarColors?.(businessTemplate)}
					>
						find similar colors
					</button>
					<button
						type="button"
						data-testid="mock-slides-template-preview-open"
						onClick={() => onPreviewOpenChange?.(true)}
					>
						open preview
					</button>
					<button
						type="button"
						data-testid="mock-slides-template-preview-close"
						onClick={() => onPreviewOpenChange?.(false)}
					>
						close preview
					</button>
				</>
			)
		},
	),
}))

vi.mock("../SlidesTemplatePromptDock", () => ({
	__esModule: true,
	default: ({
		onClearSelectedTemplate,
		onPreviewSelectedTemplate,
		selectedTemplate,
	}: {
		onClearSelectedTemplate: () => void
		onPreviewSelectedTemplate: () => void
		selectedTemplate?: OptionItem | null
	}) => (
		<div data-testid="mock-slides-template-prompt-dock">
			{selectedTemplate ? String(selectedTemplate.value) : null}
			<button
				type="button"
				data-testid="slides-templates-page-clear-selected-template"
				onClick={onClearSelectedTemplate}
			>
				clear
			</button>
			<div data-testid="slides-templates-page-selected-template">Business Template</div>
			<button
				type="button"
				data-testid="slides-templates-page-preview-selected-template"
				onClick={onPreviewSelectedTemplate}
			>
				preview
			</button>
		</div>
	),
}))

vi.mock("@/pages/superMagic/components/MainInputContainer/panels/TemplateGroupSelector", () => ({
	__esModule: true,
	default: ({ onGroupChange }: { onGroupChange: (groupKey: string) => void }) => (
		<button
			type="button"
			data-testid="slides-templates-page-group-selector"
			onClick={() => onGroupChange("business")}
		>
			groups
		</button>
	),
}))

describe("SlidesTemplatesPage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		catalogStateMock.hasMore = false
		catalogStateMock.isLoading = false
		catalogStateMock.isLoadingMore = false
		catalogStateMock.isRefreshing = false
		catalogStateMock.loadedTemplateCount = 3
		findSimilarCallbackHistory.length = 0
	})

	it("keeps canvas callbacks stable when loading more state changes", () => {
		const { rerender } = render(<SlidesTemplatesPage />)
		const initialCallback = findSimilarCallbackHistory[findSimilarCallbackHistory.length - 1]

		catalogStateMock.isLoadingMore = true
		rerender(<SlidesTemplatesPage />)

		expect(findSimilarCallbackHistory[findSimilarCallbackHistory.length - 1]).toBe(
			initialCallback,
		)
	})

	it("reuses the previous canvas options when filter membership and order are unchanged", () => {
		const previous = [businessTemplate, relatedTemplate]

		expect(reuseUnchangedTemplateOptions(previous, [...previous])).toBe(previous)
		expect(
			reuseUnchangedTemplateOptions(previous, [relatedTemplate, businessTemplate]),
		).not.toBe(previous)
	})

	it("appends newly resolved matches without moving existing canvas items", () => {
		const previous = [businessTemplate, relatedTemplate]
		const newlyResolved = { colors: ["#315ECA"], value: "PPT-new" }

		expect(
			preserveExistingTemplateOrder(previous, [
				businessTemplate,
				newlyResolved,
				relatedTemplate,
			]),
		).toEqual([businessTemplate, relatedTemplate, newlyResolved])
	})

	it("auto-loads a limited number of pages for short similar-color result sets", () => {
		expect(
			shouldLoadMoreSimilarColorTemplates({
				loadCount: 0,
				hasMore: true,
				isLoading: false,
				isLoadingMore: false,
				isRefreshing: false,
				loadedTemplateCount: 40,
				similarTemplateCount: 2,
			}),
		).toBe(true)
		expect(
			shouldLoadMoreSimilarColorTemplates({
				loadCount: 3,
				hasMore: true,
				isLoading: false,
				isLoadingMore: false,
				isRefreshing: false,
				loadedTemplateCount: 120,
				similarTemplateCount: 2,
			}),
		).toBe(false)
		expect(
			shouldLoadMoreSimilarColorTemplates({
				loadCount: 0,
				hasMore: true,
				isLoading: false,
				isLoadingMore: false,
				isRefreshing: false,
				loadedTemplateCount: 40,
				similarTemplateCount: 24,
			}),
		).toBe(false)
		expect(
			shouldLoadMoreSimilarColorTemplates({
				loadCount: 2,
				hasMore: true,
				isLoading: false,
				isLoadingMore: false,
				isRefreshing: false,
				loadedTemplateCount: 160,
				similarTemplateCount: 2,
			}),
		).toBe(false)
	})

	it("keeps search and filters at the bottom while the prompt is hidden before selection", () => {
		render(<SlidesTemplatesPage />)

		expect(screen.getByTestId("slides-templates-page-bottom-tools")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-search-input")).toBeInTheDocument()
		expect(
			screen.getByTestId("slides-templates-page-search-input").parentElement
				?.nextElementSibling,
		).toBe(screen.getByTestId("slides-templates-page-random-template"))
		expect(screen.getByTestId("slides-templates-page-group-selector")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-bottom-tools")).not.toHaveTextContent(
			"common:routes.slidesTemplates",
		)
		expect(screen.getByTestId("slides-templates-page-bottom-tools").lastElementChild).toBe(
			screen.getByTestId("slides-templates-page-group-selector"),
		)
		expect(screen.getByTestId("slides-templates-page-prompt-panel")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		expect(screen.getByTestId("mock-slides-template-prompt-dock")).toBeInTheDocument()
	})

	it("shows the selected template prompt above the search tools", () => {
		render(<SlidesTemplatesPage />)
		const promptPanel = screen.getByTestId("slides-templates-page-prompt-panel")
		const bottomTools = screen.getByTestId("slides-templates-page-bottom-tools")

		fireEvent.click(screen.getByTestId("mock-slides-template-canvas"))

		expect(bottomTools).toHaveClass("max-w-3xl")
		expect(bottomTools).not.toHaveClass("max-w-4xl")
		expect(screen.getByTestId("slides-templates-page-prompt-panel")).toBe(promptPanel)
		expect(promptPanel).toHaveAttribute("aria-hidden", "false")
		expect(screen.getByTestId("slides-templates-page-bottom-tools")).toContainElement(
			screen.getByTestId("slides-templates-page-prompt-panel"),
		)
		expect(screen.getByTestId("slides-templates-page-bottom-tools").lastElementChild).toBe(
			screen.getByTestId("slides-templates-page-group-selector"),
		)
		expect(screen.getByTestId("mock-slides-template-prompt-dock")).toHaveTextContent(
			"PPT-business",
		)
		expect(screen.getByTestId("slides-templates-page-selected-template")).toHaveTextContent(
			"Business Template",
		)
		expect(
			screen
				.getByTestId("slides-templates-page-prompt-panel")
				.compareDocumentPosition(screen.getByTestId("slides-templates-page-search-input")) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})

	it("opens the selected template preview again from the prompt", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-canvas"))
		fireEvent.click(screen.getByTestId("slides-templates-page-preview-selected-template"))

		expect(openPreviewMock).toHaveBeenCalledWith(businessTemplate)
	})

	it("asks the canvas to focus a random template from the current result set", () => {
		render(<SlidesTemplatesPage />)

		expect(screen.getByTestId("slides-template-glow-border")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("slides-templates-page-random-template"))

		expect(focusRandomTemplateMock).toHaveBeenCalledTimes(1)
	})

	it("filters the canvas to perceptually similar template palettes and restores all results", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-find-similar-colors"))

		expect(
			screen.getByTestId("slides-templates-page-similar-colors-filter"),
		).toBeInTheDocument()
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveTextContent(
			`${businessTemplate.value},${relatedTemplate.value}`,
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).not.toHaveTextContent(
			String(unrelatedTemplate.value),
		)

		fireEvent.click(screen.getByTestId("slides-templates-page-clear-similar-colors"))

		expect(
			screen.queryByTestId("slides-templates-page-similar-colors-filter"),
		).not.toBeInTheDocument()
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveTextContent(
			String(unrelatedTemplate.value),
		)
	})

	it("loads more templates when similar-color results are scarce", () => {
		catalogStateMock.hasMore = true
		catalogStateMock.loadedTemplateCount = 40
		const { rerender } = render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-find-similar-colors"))

		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(1)
		catalogStateMock.isLoadingMore = true
		rerender(<SlidesTemplatesPage />)
		catalogStateMock.isLoadingMore = false
		catalogStateMock.loadedTemplateCount = 80
		rerender(<SlidesTemplatesPage />)
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(2)
		catalogStateMock.isLoadingMore = true
		rerender(<SlidesTemplatesPage />)
		catalogStateMock.isLoadingMore = false
		catalogStateMock.loadedTemplateCount = 120
		rerender(<SlidesTemplatesPage />)
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(3)
		catalogStateMock.loadedTemplateCount = 160
		rerender(<SlidesTemplatesPage />)

		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-has-more",
			"false",
		)
		fireEvent.click(screen.getByTestId("mock-slides-template-canvas-load-more"))
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(3)
	})

	it("hides bottom tools while the inline preview is open and restores them after close", async () => {
		render(<SlidesTemplatesPage />)

		const bottomTools = screen.getByTestId("slides-templates-page-bottom-tools")
		fireEvent.click(screen.getByTestId("mock-slides-template-preview-open"))

		await waitForElementToBeRemoved(bottomTools)
		expect(screen.queryByTestId("slides-templates-page-search-input")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("mock-slides-template-preview-close"))

		expect(await screen.findByTestId("slides-templates-page-bottom-tools")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-search-input")).toBeInTheDocument()
	})

	it("clears the selected template and hides the prompt immediately", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-canvas"))
		fireEvent.click(screen.getByTestId("slides-templates-page-clear-selected-template"))

		expect(screen.getByTestId("slides-templates-page-prompt-panel")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		expect(screen.getByTestId("mock-slides-template-prompt-dock")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-prompt-region")).toHaveClass(
			"grid-rows-[0fr]",
			"transition-none",
		)
	})

	it("keeps search and group actions wired from the bottom tools", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.change(screen.getByTestId("slides-templates-page-search-input"), {
			target: { value: "business" },
		})
		fireEvent.click(screen.getByTestId("slides-templates-page-group-selector"))

		expect(catalogStateMock.setKeyword).toHaveBeenCalledWith("business")
		expect(catalogStateMock.setSelectedGroupKey).toHaveBeenCalledWith("business")
	})
})
