import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import type { SlidesTemplatePreviewFocus } from "../canvasInteraction"
import SlidesTemplateInlinePreview from "../SlidesTemplateInlinePreview"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string) => key,
	}),
}))

const template: OptionItem = {
	value: "PPT-business",
	label: "Business",
	thumbnail_url: "https://example.com/business-cover.png",
	preview_image_urls: Array.from(
		{ length: 8 },
		(_, index) => `https://example.com/business-${index + 1}.png`,
	),
}

const focus: SlidesTemplatePreviewFocus = {
	anchorTileId: "business-cover",
	tile: {
		id: "business-cover",
		imageUrl: template.preview_image_urls?.[0],
		kind: "cover",
		template,
	},
}

function renderPreview({
	onClose = vi.fn(),
	onTemplateSelect = vi.fn(),
}: {
	onClose?: () => void
	onTemplateSelect?: (template: OptionItem) => void
} = {}) {
	const result = render(
		<SlidesTemplateInlinePreview
			focus={focus}
			onClose={onClose}
			onTemplateSelect={onTemplateSelect}
			selectedTemplate={null}
		/>,
	)

	return {
		onClose,
		onTemplateSelect,
		...result,
	}
}

function mockRect(left: number, width: number) {
	return {
		bottom: 120,
		height: 90,
		left,
		right: left + width,
		top: 30,
		width,
		x: left,
		y: 30,
		toJSON: () => ({}),
	}
}

describe("SlidesTemplateInlinePreview", () => {
	it("closes when clicking the empty preview background", () => {
		const { onClose } = renderPreview()

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-showcase"))

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("keeps the preview open when clicking the main preview or thumbnail rail", () => {
		const { onClose } = renderPreview()

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-pages"))
		fireEvent.click(screen.getByTestId("slides-template-inline-preview-thumbnail-rail"))

		expect(onClose).not.toHaveBeenCalled()
	})

	it("closes after using the selected template", () => {
		const { onClose, onTemplateSelect } = renderPreview()

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-use-button"))

		expect(onTemplateSelect).toHaveBeenCalledWith(template)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("centers the active thumbnail after switching pages", () => {
		renderPreview()
		const thumbnailRail = screen.getByTestId("slides-template-inline-preview-thumbnail-rail")
		const scroller = thumbnailRail.firstElementChild as HTMLDivElement
		const secondThumbnail = screen.getAllByTestId("slides-template-inline-preview-thumbnail")[1]
		const secondThumbnailItem = secondThumbnail.parentElement as HTMLDivElement
		const scrollTo = vi.fn()

		Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 200 })
		Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 1000 })
		Object.defineProperty(scroller, "scrollLeft", {
			configurable: true,
			get: () => 20,
			set: vi.fn(),
		})
		scroller.scrollTo = scrollTo
		vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(mockRect(0, 200))
		vi.spyOn(secondThumbnailItem, "getBoundingClientRect").mockReturnValue(mockRect(300, 100))

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-next-button"))

		expect(scrollTo).toHaveBeenCalledWith({
			behavior: "smooth",
			left: 270,
		})
	})
})
