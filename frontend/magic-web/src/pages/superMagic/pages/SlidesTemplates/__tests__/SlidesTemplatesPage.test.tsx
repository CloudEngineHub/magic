import { fireEvent, render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { forwardRef, useImperativeHandle } from "react"
import type {
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplatesPage from "../index"

const { catalogStateMock, businessTemplate, openPreviewMock } = vi.hoisted(() => {
	const template: OptionItem = {
		value: "PPT-business",
		label: {
			zh_CN: "商务模板",
			en_US: "Business Template",
		},
		thumbnail_url: "https://example.com/business-cover.png",
	}
	const groups: OptionGroup[] = [
		{
			group_key: "all",
			group_name: "All",
			children: [template],
		},
		{
			group_key: "business",
			group_name: "Business",
			children: [template],
		},
	]

	return {
		businessTemplate: template,
		openPreviewMock: vi.fn(),
		catalogStateMock: {
			groups,
			hasAnyTemplate: true,
			hasCheckedAnyTemplate: true,
			hasMore: false,
			isLoading: false,
			isRefreshing: false,
			isLoadingMore: false,
			keyword: "",
			loadMore: vi.fn(),
			selectedGroupKey: "all",
			setKeyword: vi.fn(),
			setSelectedGroupKey: vi.fn(),
			templateOptions: [template],
		},
	}
})

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
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
				onPreviewOpenChange,
				onTemplateSelect,
			}: {
				onPreviewOpenChange?: (isOpen: boolean) => void
				onTemplateSelect: (template: OptionItem) => void
			},
			ref,
		) => {
			useImperativeHandle(ref, () => ({ openPreview: openPreviewMock }))
			return (
				<>
					<button
						type="button"
						data-testid="mock-slides-template-canvas"
						onClick={() => onTemplateSelect(businessTemplate)}
					>
						canvas
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
		selectedTemplate: OptionItem
	}) => (
		<div data-testid="mock-slides-template-prompt-dock">
			{String(selectedTemplate.value)}
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
	})

	it("keeps search and filters at the bottom while the prompt is hidden before selection", () => {
		render(<SlidesTemplatesPage />)

		expect(screen.getByTestId("slides-templates-page-bottom-tools")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-search-input")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-group-selector")).toBeInTheDocument()
		expect(screen.getByTestId("slides-templates-page-bottom-tools")).not.toHaveTextContent(
			"common:routes.slidesTemplates",
		)
		expect(screen.getByTestId("slides-templates-page-bottom-tools").lastElementChild).toBe(
			screen.getByTestId("slides-templates-page-group-selector"),
		)
		expect(screen.queryByTestId("slides-templates-page-prompt-panel")).not.toBeInTheDocument()
		expect(screen.queryByTestId("mock-slides-template-prompt-dock")).not.toBeInTheDocument()
	})

	it("shows the selected template prompt above the search tools", () => {
		render(<SlidesTemplatesPage />)

		fireEvent.click(screen.getByTestId("mock-slides-template-canvas"))

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

		expect(screen.queryByTestId("slides-templates-page-prompt-panel")).not.toBeInTheDocument()
		expect(screen.queryByTestId("mock-slides-template-prompt-dock")).not.toBeInTheDocument()
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
