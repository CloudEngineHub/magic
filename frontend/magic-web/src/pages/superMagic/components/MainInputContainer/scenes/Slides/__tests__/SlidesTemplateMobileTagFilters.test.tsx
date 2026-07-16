import { fireEvent, render, screen } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { SlidesTemplateTagFiltersSkeleton } from "../SlidesTemplateFilterSkeleton"
import SlidesTemplateMobileTagFilters from "../SlidesTemplateMobileTagFilters"
import type { SlidesTemplateTagGroupItem } from "../slidesTemplateState"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en_US" },
	}),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => true,
}))

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

function renderFilters(selectedTagCodes: string[] = [], onSelectedTagCodesChange = vi.fn()) {
	render(
		<SlidesTemplateMobileTagFilters
			tagGroups={tagGroups}
			selectedTagCodes={selectedTagCodes}
			onSelectedTagCodesChange={onSelectedTagCodesChange}
		/>,
	)

	return { onSelectedTagCodesChange }
}

describe("SlidesTemplateMobileTagFilters", () => {
	beforeAll(() => {
		vi.stubGlobal(
			"ResizeObserver",
			vi.fn(() => ({
				disconnect: vi.fn(),
				observe: vi.fn(),
				unobserve: vi.fn(),
			})),
		)
	})

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("keeps tag groups in a single horizontal row with a fixed all-filters button", () => {
		renderFilters(["style-business"])

		const row = screen.getByTestId("slides-template-mobile-tag-filters")
		const scrollRoot = screen.getByTestId("slides-template-mobile-tag-filter-scroll")
		const scrollContainer = scrollRoot.firstElementChild
		const allFiltersTrigger = screen.getByTestId("slides-template-mobile-all-filters-trigger")

		expect(row).toHaveClass("flex", "items-center")
		expect(scrollContainer).toHaveClass(
			"flex",
			"touch-pan-x",
			"overflow-x-auto",
			"overflow-y-hidden",
		)
		expect(scrollContainer).not.toHaveClass("flex-wrap")
		expect(scrollContainer).toContainElement(
			screen.getByTestId("slides-template-tag-group-trigger-purpose_group"),
		)
		expect(scrollContainer).toContainElement(
			screen.getByTestId("slides-template-tag-group-trigger-style_group"),
		)
		expect(scrollRoot).not.toContainElement(allFiltersTrigger)
		expect(row).toContainElement(allFiltersTrigger)
		expect(screen.getByTestId("slides-template-mobile-all-filters-count")).toHaveTextContent(
			"1",
		)
	})

	it("keeps all-filter edits as a draft until confirm", () => {
		const onSelectedTagCodesChange = vi.fn()
		renderFilters(["style-business"], onSelectedTagCodesChange)

		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-trigger"))
		const panel = screen.getByTestId("slides-template-mobile-all-filters-panel")
		expect(panel).toBeInTheDocument()
		expect(panel).toHaveClass("grid", "grid-cols-[7.5rem_minmax(0,1fr)]")
		expect(panel.parentElement?.parentElement).toHaveClass(
			"!h-[min(720px,85dvh)]",
			"max-h-[85dvh]",
		)
		expect(
			screen.getByTestId("slides-template-mobile-all-filters-group-purpose_group"),
		).toBeInTheDocument()
		expect(
			screen.getByTestId("slides-template-mobile-all-filters-group-style_group"),
		).toHaveAttribute("aria-pressed", "true")
		expect(screen.getByTestId("slides-template-mobile-all-filters-values")).toContainElement(
			screen.getByTestId("slides-template-mobile-all-filters-option-style-business"),
		)

		fireEvent.click(
			screen.getByTestId("slides-template-mobile-all-filters-group-purpose_group"),
		)
		fireEvent.click(
			screen.getByTestId("slides-template-mobile-all-filters-option-purpose-annual-report"),
		)
		expect(onSelectedTagCodesChange).not.toHaveBeenCalled()

		fireEvent.click(
			screen.getByRole("button", {
				name: "playbook.edit.presets.form.confirm",
			}),
		)
		expect(onSelectedTagCodesChange).toHaveBeenCalledTimes(1)
		expect(onSelectedTagCodesChange).toHaveBeenCalledWith([
			"style-business",
			"purpose-annual-report",
		])
	})

	it("discards cancelled drafts and restores the current selection on reopen", () => {
		const onSelectedTagCodesChange = vi.fn()
		renderFilters(["style-business"], onSelectedTagCodesChange)

		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-trigger"))
		fireEvent.click(
			screen.getByTestId("slides-template-mobile-all-filters-group-purpose_group"),
		)
		fireEvent.click(
			screen.getByTestId("slides-template-mobile-all-filters-option-purpose-annual-report"),
		)
		fireEvent.click(
			screen.getByRole("button", {
				name: "playbook.edit.presets.form.cancel",
			}),
		)
		expect(onSelectedTagCodesChange).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-trigger"))
		fireEvent.click(
			screen.getByTestId("slides-template-mobile-all-filters-group-purpose_group"),
		)
		expect(
			screen.getByTestId("slides-template-mobile-all-filters-option-purpose-annual-report"),
		).toHaveAttribute("aria-pressed", "false")
		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-group-style_group"))
		expect(
			screen.getByTestId("slides-template-mobile-all-filters-option-style-business"),
		).toHaveAttribute("aria-pressed", "true")
	})

	it("clears only the draft until the user confirms", () => {
		const onSelectedTagCodesChange = vi.fn()
		renderFilters(["style-business"], onSelectedTagCodesChange)

		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-trigger"))
		fireEvent.click(screen.getByTestId("slides-template-mobile-all-filters-clear"))
		expect(onSelectedTagCodesChange).not.toHaveBeenCalled()

		fireEvent.click(
			screen.getByRole("button", {
				name: "playbook.edit.presets.form.confirm",
			}),
		)
		expect(onSelectedTagCodesChange).toHaveBeenCalledWith([])
	})

	it("keeps the existing confirmable single-group selector", () => {
		const onSelectedTagCodesChange = vi.fn()
		renderFilters(["style-business"], onSelectedTagCodesChange)

		fireEvent.click(screen.getByTestId("slides-template-tag-group-trigger-purpose_group"))
		fireEvent.click(
			screen.getByTestId("slides-template-tag-mobile-option-purpose-annual-report"),
		)
		expect(onSelectedTagCodesChange).not.toHaveBeenCalled()

		fireEvent.click(
			screen.getByRole("button", {
				name: "playbook.edit.presets.form.confirm",
			}),
		)
		expect(onSelectedTagCodesChange).toHaveBeenCalledWith([
			"style-business",
			"purpose-annual-report",
		])
	})
})

describe("SlidesTemplateTagFiltersSkeleton", () => {
	it("uses a single mobile row with a fixed button placeholder", () => {
		render(<SlidesTemplateTagFiltersSkeleton isMobile />)

		const skeleton = screen.getByTestId("slides-template-tag-filters-skeleton")
		const buttonSkeleton = screen.getByTestId("slides-template-tag-filter-button-skeleton")

		expect(skeleton).toHaveClass("flex", "items-center")
		expect(skeleton).not.toHaveClass("grid")
		expect(skeleton).toContainElement(buttonSkeleton)
		expect(buttonSkeleton).toHaveClass("size-8", "shrink-0", "rounded-full")
	})
})
