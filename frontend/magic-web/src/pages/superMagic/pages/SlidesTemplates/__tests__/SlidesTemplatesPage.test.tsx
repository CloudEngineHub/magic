import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	waitForElementToBeRemoved,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { forwardRef, useImperativeHandle } from "react"
import type {
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplatesPage from "../index"

const {
	catalogStateMock,
	catalogOptionsHistory,
	businessTemplate,
	findSimilarCallbackHistory,
	focusRandomTemplateMock,
	openPreviewMock,
	relatedTemplate,
	secondaryMatchTemplate,
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
	const secondaryMatch: OptionItem = {
		value: "PPT-secondary-match",
		label: "Secondary Match",
		colors: ["#D97706", "#7AA7FF", "#182A5A"],
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
		catalogOptionsHistory: [] as Array<{ pageSize?: number } | undefined>,
		findSimilarCallbackHistory: [] as Array<((template: OptionItem) => void) | undefined>,
		focusRandomTemplateMock: vi.fn(),
		openPreviewMock: vi.fn(),
		relatedTemplate: related,
		secondaryMatchTemplate: secondaryMatch,
		unrelatedTemplate: unrelated,
		catalogStateMock: {
			groups,
			hasAnyTemplate: true,
			hasCheckedAnyTemplate: true,
			hasMore: false,
			isLoading: false,
			isRefreshing: false,
			isLoadingMore: false,
			isLoadMoreFailed: false,
			keyword: "",
			debouncedKeyword: "",
			loadedTemplateCount: 3,
			loadMore: vi.fn(),
			loadTemplateDetail: vi.fn().mockResolvedValue(null),
			selectedGroupKey: "all",
			setKeyword: vi.fn(),
			setSelectedGroupKey: vi.fn(),
			templateOptions: [template, related, unrelated],
			total: 3,
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
		useSlidesTemplateCatalogState: (options?: { pageSize?: number }) => {
			catalogOptionsHistory.push(options)
			return catalogStateMock
		},
	}),
)

vi.mock("../SlidesTemplateCanvas", () => ({
	__esModule: true,
	default: forwardRef(
		(
			{
				enableInfiniteLoop,
				hasMore,
				initialAlignment,
				onLoadMore,
				onFindSimilarColors,
				onPreviewOpenChange,
				onTemplateSelect,
				templates,
			}: {
				enableInfiniteLoop?: boolean
				hasMore: boolean
				initialAlignment?: "center" | "top"
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
						data-initial-alignment={initialAlignment}
						data-loop-enabled={String(enableInfiniteLoop)}
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
		catalogStateMock.isLoadMoreFailed = false
		catalogStateMock.isRefreshing = false
		catalogStateMock.loadedTemplateCount = 3
		catalogStateMock.templateOptions = [businessTemplate, relatedTemplate, unrelatedTemplate]
		catalogOptionsHistory.length = 0
		findSimilarCallbackHistory.length = 0
	})

	it("loads templates in backend-sized batches", () => {
		render(<SlidesTemplatesPage />)

		expect(catalogOptionsHistory.at(-1)).toEqual({ pageSize: 200 })
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-loop-enabled",
			"true",
		)
	})

	it("disables the infinite loop while searching and restores it after clearing", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.change(screen.getByTestId("slides-templates-page-search-input"), {
			target: { value: "business" },
		})
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-loop-enabled",
			"false",
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-initial-alignment",
			"center",
		)

		fireEvent.click(screen.getByTestId("slides-templates-page-search-clear"))
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-loop-enabled",
			"true",
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-initial-alignment",
			"center",
		)
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
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-loop-enabled",
			"false",
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-initial-alignment",
			"top",
		)
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
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-loop-enabled",
			"true",
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-initial-alignment",
			"center",
		)
	})

	it("prefers primary-color matches and falls back to the full palette when needed", () => {
		catalogStateMock.templateOptions = [
			businessTemplate,
			relatedTemplate,
			secondaryMatchTemplate,
		]
		const { rerender } = render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-find-similar-colors"))
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveTextContent(
			`${businessTemplate.value},${relatedTemplate.value}`,
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).not.toHaveTextContent(
			String(secondaryMatchTemplate.value),
		)

		catalogStateMock.templateOptions = [businessTemplate, secondaryMatchTemplate]
		rerender(<SlidesTemplatesPage />)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveTextContent(
			String(secondaryMatchTemplate.value),
		)
	})

	it("extends similar-color results with newly loaded templates and stops at the last page", async () => {
		catalogStateMock.hasMore = true
		catalogStateMock.loadedTemplateCount = 200
		const { rerender } = render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-find-similar-colors"))
		await waitFor(() => expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(1))

		catalogStateMock.templateOptions = [
			businessTemplate,
			relatedTemplate,
			unrelatedTemplate,
			{ value: "PPT-new-related", colors: ["#315ECA", "#7AA7FF"] },
		]
		catalogStateMock.loadedTemplateCount = 400
		catalogStateMock.hasMore = false
		rerender(<SlidesTemplatesPage />)

		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveTextContent(
			"PPT-new-related",
		)
		expect(screen.getByTestId("mock-slides-template-canvas-options")).toHaveAttribute(
			"data-has-more",
			"false",
		)
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(1)
	})

	it("limits automatic similar-color pagination frequency", () => {
		vi.useFakeTimers()
		catalogStateMock.hasMore = true
		catalogStateMock.loadedTemplateCount = 200
		const { rerender } = render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-find-similar-colors"))
		act(() => vi.runOnlyPendingTimers())
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(1)

		catalogStateMock.isLoadingMore = true
		rerender(<SlidesTemplatesPage />)
		catalogStateMock.isLoadingMore = false
		catalogStateMock.loadedTemplateCount = 400
		rerender(<SlidesTemplatesPage />)

		act(() => vi.advanceTimersByTime(599))
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(1)
		act(() => vi.advanceTimersByTime(1))
		expect(catalogStateMock.loadMore).toHaveBeenCalledTimes(2)

		vi.useRealTimers()
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
