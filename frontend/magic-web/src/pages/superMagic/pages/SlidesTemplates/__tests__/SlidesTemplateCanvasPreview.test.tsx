import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplateCanvas from "../SlidesTemplateCanvas"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: (key: string) => key,
	}),
}))

function createTemplate(index: number, previewCount = 0): OptionItem {
	return {
		value: `PPT-${index}`,
		label: `Template ${index}`,
		thumbnail_url: `https://example.com/${index}-cover.png`,
		preview_image_urls: Array.from(
			{ length: previewCount },
			(_, pageIndex) => `https://example.com/${index}-page-${pageIndex + 1}.png`,
		),
	}
}

function renderCanvas(onPreviewOpenChange?: (isOpen: boolean) => void) {
	return render(
		<SlidesTemplateCanvas
			templates={[
				createTemplate(1, 10),
				...Array.from({ length: 12 }, (_, index) => createTemplate(index + 2)),
			]}
			selectedTemplate={null}
			onTemplateSelect={vi.fn()}
			hasMore
			isLoading={false}
			isLoadingMore={false}
			isRefreshing={false}
			onLoadMore={vi.fn()}
			onPreviewOpenChange={onPreviewOpenChange}
			resetKey="all:"
		/>,
	)
}

function mockCanvasRect(canvas: HTMLElement) {
	vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
		bottom: 600,
		height: 600,
		left: 0,
		right: 800,
		top: 0,
		width: 800,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	})
}

function getFirstTestElement(testId: string) {
	const element = screen.getAllByTestId(testId)[0]
	expect(element).toBeDefined()
	return element as HTMLElement
}

function fireCanvasPointerEvent(
	element: HTMLElement,
	type: "pointerdown" | "pointermove" | "pointerup",
	init: {
		button?: number
		clientX: number
		clientY: number
		isPrimary?: boolean
		pointerId: number
	},
) {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: init.button ?? 0,
		cancelable: true,
		clientX: init.clientX,
		clientY: init.clientY,
	})

	Object.defineProperties(event, {
		isPrimary: { value: init.isPrimary ?? true },
		pointerId: { value: init.pointerId },
	})

	fireEvent(element, event)
}

describe("SlidesTemplateCanvas preview", () => {
	beforeAll(() => {
		Element.prototype.setPointerCapture = vi.fn()
		Element.prototype.releasePointerCapture = vi.fn()
		Element.prototype.hasPointerCapture = vi.fn(() => true)
	})

	afterAll(() => {
		vi.restoreAllMocks()
	})

	it("does not preview the template after dragging from a cover tile", () => {
		renderCanvas()
		const canvas = screen.getByTestId("slides-template-canvas")
		const tile = getFirstTestElement("slides-template-cover-tile")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(tile, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 150,
			clientY: 125,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointerup", {
			clientX: 150,
			clientY: 125,
			isPrimary: true,
			pointerId: 1,
		})
		fireEvent.click(tile)

		expect(screen.queryByTestId("slides-template-inline-preview")).not.toBeInTheDocument()
	})

	it("opens an inline preview stage and switches pages", () => {
		renderCanvas()

		fireEvent.click(getFirstTestElement("slides-template-cover-preview-button"))

		const preview = screen.getByTestId("slides-template-inline-preview")
		expect(preview).toBeInTheDocument()
		expect(preview).toHaveClass("w-[calc(100%-48px)]")
		expect(preview).not.toHaveClass("w-[min(1120px,calc(100%-48px))]")
		expect(screen.getByTestId("slides-template-inline-preview-title")).toHaveTextContent(
			"Template 1",
		)
		expect(screen.getByTestId("slides-template-inline-preview-pages")).toBeInTheDocument()
		expect(screen.getByTestId("slides-template-inline-preview-pages")).toHaveClass(
			"bg-transparent",
		)
		expect(screen.getByTestId("slides-template-inline-preview-pages")).not.toHaveClass(
			"bg-white/[0.74]",
		)
		expect(screen.getByTestId("slides-template-inline-preview-page-index")).toHaveTextContent(
			"1 / 10",
		)
		const thumbnailRail = screen.getByTestId("slides-template-inline-preview-thumbnail-rail")
		const thumbnailScroller = thumbnailRail.firstElementChild
		expect(thumbnailScroller).toHaveClass("scrollbar-x-thin")
		expect(thumbnailScroller).not.toHaveClass("no-scrollbar")

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-next-button"))

		expect(screen.getByTestId("slides-template-inline-preview-page-index")).toHaveTextContent(
			"2 / 10",
		)
	})

	it("hides canvas controls and disables canvas movement while previewing", () => {
		renderCanvas()
		const canvas = screen.getByTestId("slides-template-canvas")
		const content = screen.getByTestId("slides-template-canvas-content")
		mockCanvasRect(canvas)

		fireEvent.click(getFirstTestElement("slides-template-cover-preview-button"))

		expect(screen.queryByTestId("slides-template-canvas-move-left")).not.toBeInTheDocument()
		expect(screen.queryByTestId("slides-template-canvas-move-right")).not.toBeInTheDocument()
		expect(screen.queryByTestId("slides-template-canvas-zoom-controls")).not.toBeInTheDocument()

		const transformBeforeDrag = content.style.transform
		fireCanvasPointerEvent(canvas, "pointerdown", {
			clientX: 100,
			clientY: 100,
			pointerId: 2,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 180,
			clientY: 140,
			pointerId: 2,
		})
		fireCanvasPointerEvent(canvas, "pointerup", {
			clientX: 180,
			clientY: 140,
			pointerId: 2,
		})
		fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 120 })

		expect(content.style.transform).toBe(transformBeforeDrag)

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-close"))

		expect(screen.getByTestId("slides-template-canvas-move-left")).toBeInTheDocument()
		expect(screen.getByTestId("slides-template-canvas-move-right")).toBeInTheDocument()
		expect(screen.getByTestId("slides-template-canvas-zoom-controls")).toBeInTheDocument()
	})

	it("switches preview pages from wheel input over the main preview area", () => {
		renderCanvas()

		fireEvent.click(getFirstTestElement("slides-template-cover-preview-button"))

		expect(screen.getByTestId("slides-template-inline-preview-page-index")).toHaveTextContent(
			"1 / 10",
		)

		fireEvent.wheel(screen.getByTestId("slides-template-inline-preview-pages"), {
			deltaY: 120,
		})

		expect(screen.getByTestId("slides-template-inline-preview-page-index")).toHaveTextContent(
			"2 / 10",
		)
	})

	it("reports inline preview open state changes", () => {
		const onPreviewOpenChange = vi.fn()
		renderCanvas(onPreviewOpenChange)

		expect(onPreviewOpenChange).toHaveBeenLastCalledWith(false)

		fireEvent.click(getFirstTestElement("slides-template-cover-preview-button"))

		expect(onPreviewOpenChange).toHaveBeenLastCalledWith(true)

		fireEvent.click(screen.getByTestId("slides-template-inline-preview-close"))

		expect(onPreviewOpenChange).toHaveBeenLastCalledWith(false)
	})

	it("auto closes the inline preview after idle time", () => {
		vi.useFakeTimers()

		try {
			renderCanvas()

			fireEvent.click(getFirstTestElement("slides-template-cover-preview-button"))

			expect(screen.getByTestId("slides-template-inline-preview")).toBeInTheDocument()

			act(() => {
				vi.advanceTimersByTime(9000)
			})

			expect(screen.queryByTestId("slides-template-inline-preview")).not.toBeInTheDocument()
		} finally {
			vi.useRealTimers()
		}
	})
})
