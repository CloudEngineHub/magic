import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplateCanvas from "../SlidesTemplateCanvas"
import {
	SLIDES_TEMPLATE_CANVAS_FEATURED_CARD_HEIGHT,
	SLIDES_TEMPLATE_CANVAS_FEATURED_CARD_WIDTH,
} from "../canvasLayout"
import { MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS } from "../canvasViewport"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string) => key,
	}),
}))

function createTemplate(index: number): OptionItem {
	return {
		value: `PPT-${index}`,
		label: `Template ${index}`,
		thumbnail_url: `https://example.com/${index}-cover.png`,
		preview_image_urls: [],
		colors: ["#315ECA", "#7AA7FF", "#182A5A"],
	}
}

function createFeaturedTemplate(index: number): OptionItem {
	return {
		...createTemplate(index),
		tags: [
			{
				code: "featured",
				id: `featured-${index}`,
				name_i18n: {
					zh_CN: "精选",
					en_US: "Featured",
				},
			},
		],
	}
}

function renderCanvas(
	templates: OptionItem[],
	{
		hasMore = true,
		onFindSimilarColors,
		onTemplateSelect = vi.fn(),
		selectedTemplate = null,
	}: {
		hasMore?: boolean
		onFindSimilarColors?: (template: OptionItem) => void
		onTemplateSelect?: (template: OptionItem) => void
		selectedTemplate?: OptionItem | null
	} = {},
) {
	return render(
		<SlidesTemplateCanvas
			templates={templates}
			selectedTemplate={selectedTemplate}
			onTemplateSelect={onTemplateSelect}
			hasMore={hasMore}
			isLoading={false}
			isLoadingMore={false}
			isRefreshing={false}
			onLoadMore={vi.fn()}
			onFindSimilarColors={onFindSimilarColors}
			resetKey="all:"
		/>,
	)
}

function getFirstTestElement(testId: string) {
	const element = screen.getAllByTestId(testId)[0]
	expect(element).toBeDefined()
	return element as HTMLElement
}

describe("SlidesTemplateCanvas rendering", () => {
	it("renders only the visible canvas window instead of every loaded tile", () => {
		renderCanvas(Array.from({ length: 240 }, (_, index) => createTemplate(index + 1)))

		const renderedTiles = screen.getAllByTestId("slides-template-canvas-tile-item")

		expect(renderedTiles.length).toBeGreaterThan(0)
		expect(renderedTiles.length).toBeLessThan(240)
		expect(renderedTiles.length).toBeLessThanOrEqual(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
		expect(screen.getAllByTestId("slides-template-loop-cover").length).toBeLessThanOrEqual(
			renderedTiles.length * 2,
		)
	})

	it("renders featured templates with a larger canvas tile", () => {
		renderCanvas([createFeaturedTemplate(1)])

		expect(getFirstTestElement("slides-template-canvas-tile-item")).toHaveStyle({
			height: `${SLIDES_TEMPLATE_CANVAS_FEATURED_CARD_HEIGHT}px`,
			width: `${SLIDES_TEMPLATE_CANVAS_FEATURED_CARD_WIDTH}px`,
			zIndex: "10",
		})
	})

	it("renders each loaded cover once before more pages arrive", () => {
		renderCanvas(Array.from({ length: 3 }, (_, index) => createTemplate(index + 1)))

		expect(screen.getAllByTestId("slides-template-cover-tile")).toHaveLength(3)
	})

	it("renders each exhausted cover once", () => {
		renderCanvas(
			Array.from({ length: 3 }, (_, index) => createTemplate(index + 1)),
			{
				hasMore: false,
			},
		)

		expect(screen.getAllByTestId("slides-template-cover-tile")).toHaveLength(3)
	})

	it("only renders usage counts greater than zero", () => {
		renderCanvas([
			{ ...createTemplate(1), usage_count: 23 },
			{ ...createTemplate(2), usage_count: 0 },
		])

		expect(screen.getAllByTestId("slides-template-cover-usage-count")).toHaveLength(1)
		expect(screen.getByTestId("slides-template-cover-usage-count")).toHaveTextContent("23")
	})

	it("loads the first viewport-sized cover batch eagerly", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))

		const coverImages = screen
			.getAllByTestId("slides-template-static-cover")
			.flatMap((cover) => Array.from(cover.querySelectorAll("img")))
			.filter((image) => image.getAttribute("alt"))

		expect(coverImages.length).toBeGreaterThan(36)
		expect(
			coverImages.filter((image) => image.getAttribute("loading") === "eager"),
		).toHaveLength(36)
		expect(coverImages.some((image) => image.getAttribute("loading") === "lazy")).toBe(true)
	})

	it("selects the template from the explicit select button", () => {
		const onTemplateSelect = vi.fn()
		const selectedTemplate = createTemplate(1)
		renderCanvas([selectedTemplate], { onTemplateSelect })

		fireEvent.click(getFirstTestElement("slides-template-cover-select-button"))

		expect(onTemplateSelect).toHaveBeenCalledWith(selectedTemplate)
	})

	it("shows the animated glow border for the selected template", () => {
		const selectedTemplate = createTemplate(1)
		renderCanvas([selectedTemplate], { selectedTemplate })

		expect(screen.getByTestId("slides-template-glow-border")).toBeInTheDocument()
		expect(screen.getByTestId("slides-template-color-palette")).toBeInTheDocument()
	})

	it("shows the palette on hover and finds templates with similar colors when clicked", () => {
		const template = createTemplate(1)
		const onFindSimilarColors = vi.fn()
		const onTemplateSelect = vi.fn()
		renderCanvas([template], { onFindSimilarColors, onTemplateSelect })

		const palette = screen.getByTestId("slides-template-color-palette")
		expect(palette).toHaveClass("opacity-0", "group-hover:opacity-100")

		fireEvent.click(palette)

		expect(onFindSimilarColors).toHaveBeenCalledWith(template)
		expect(onTemplateSelect).not.toHaveBeenCalled()
	})
})
