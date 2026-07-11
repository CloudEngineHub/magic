import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplateCanvas from "../SlidesTemplateCanvas"
import { getLoadMoreThreshold } from "../canvasInteraction"

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
	preview_image_urls: [
		"https://example.com/business-1.png",
		"https://example.com/business-2.png",
		"https://example.com/business-3.png",
	],
}

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

function renderCanvas(
	templates: OptionItem[] = [template],
	onTemplateSelect = vi.fn(),
	{
		hasMore = true,
		onLoadMore = vi.fn(),
	}: {
		hasMore?: boolean
		onLoadMore?: () => void
	} = {},
) {
	return render(
		<SlidesTemplateCanvas
			templates={templates}
			selectedTemplate={null}
			onTemplateSelect={onTemplateSelect}
			hasMore={hasMore}
			isLoading={false}
			isLoadingMore={false}
			isRefreshing={false}
			onLoadMore={onLoadMore}
			resetKey="all:"
		/>,
	)
}

const CANVAS_RECT = {
	bottom: 600,
	height: 600,
	left: 0,
	right: 800,
	top: 0,
	width: 800,
	x: 0,
	y: 0,
	toJSON: () => ({}),
}

function mockCanvasRect(canvas: HTMLElement) {
	vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(CANVAS_RECT)
}

function getFirstTestElement(testId: string) {
	const element = screen.getAllByTestId(testId)[0]
	expect(element).toBeDefined()
	return element as HTMLElement
}

function getCanvasTranslate() {
	const transform = screen.getByTestId("slides-template-canvas-content").style.transform
	const match = /translate3d\((-?\d+(?:\.\d+)?)px, (-?\d+(?:\.\d+)?)px, 0\) scale/.exec(transform)
	expect(match).not.toBeNull()

	return {
		x: Number(match?.[1]),
		y: Number(match?.[2]),
	}
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

describe("SlidesTemplateCanvas", () => {
	beforeAll(() => {
		Element.prototype.setPointerCapture = vi.fn()
		Element.prototype.releasePointerCapture = vi.fn()
		Element.prototype.hasPointerCapture = vi.fn(() => true)
	})

	afterAll(() => {
		vi.restoreAllMocks()
	})

	it("drags the canvas when the pointer starts on the background", () => {
		renderCanvas()
		const canvas = screen.getByTestId("slides-template-canvas")
		const setPointerCapture = vi.spyOn(canvas, "setPointerCapture")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		expect(setPointerCapture).not.toHaveBeenCalled()
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 150,
			clientY: 125,
			isPrimary: true,
			pointerId: 1,
		})

		expect(screen.getByTestId("slides-template-canvas-content")).toHaveStyle({
			transform: "translate3d(50px, 25px, 0) scale(1)",
		})
		expect(setPointerCapture).toHaveBeenCalledWith(1)
	})

	it("constrains dragging at the finite canvas edge after templates are exhausted", () => {
		renderCanvas([template], vi.fn(), { hasMore: false })
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 5000,
			clientY: -4000,
			isPrimary: true,
			pointerId: 1,
		})

		const offset = getCanvasTranslate()
		expect(offset).toEqual({ x: 0, y: 0 })
	})

	it("locks the right canvas edge without extra padding after templates are exhausted", () => {
		const exhaustedRender = renderCanvas([template], vi.fn(), { hasMore: false })
		const exhaustedCanvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(exhaustedCanvas)

		fireCanvasPointerEvent(exhaustedCanvas, "pointerdown", {
			button: 0,
			clientX: 500,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(exhaustedCanvas, "pointermove", {
			clientX: -5000,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		const exhaustedOffset = getCanvasTranslate()
		exhaustedRender.unmount()

		renderCanvas([template], vi.fn(), { hasMore: true })
		const loadingCanvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(loadingCanvas)

		fireCanvasPointerEvent(loadingCanvas, "pointerdown", {
			button: 0,
			clientX: 500,
			clientY: 300,
			isPrimary: true,
			pointerId: 2,
		})
		fireCanvasPointerEvent(loadingCanvas, "pointermove", {
			clientX: -5000,
			clientY: 300,
			isPrimary: true,
			pointerId: 2,
		})
		const loadingOffset = getCanvasTranslate()

		expect(loadingOffset.x).toBeLessThan(exhaustedOffset.x)
		expect(loadingOffset.x).toBeGreaterThan(exhaustedOffset.x - 120)
	})

	it("keeps a larger edge buffer while more templates can load", () => {
		const exhaustedRender = renderCanvas([template], vi.fn(), { hasMore: false })
		const exhaustedCanvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(exhaustedCanvas)

		fireCanvasPointerEvent(exhaustedCanvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(exhaustedCanvas, "pointermove", {
			clientX: 5000,
			clientY: -4000,
			isPrimary: true,
			pointerId: 1,
		})
		const exhaustedOffset = getCanvasTranslate()
		exhaustedRender.unmount()

		renderCanvas([template], vi.fn(), { hasMore: true })
		const loadingCanvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(loadingCanvas)

		fireCanvasPointerEvent(loadingCanvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 2,
		})
		fireCanvasPointerEvent(loadingCanvas, "pointermove", {
			clientX: 5000,
			clientY: -4000,
			isPrimary: true,
			pointerId: 2,
		})
		const loadingOffset = getCanvasTranslate()

		expect(loadingOffset.x).toBeGreaterThan(exhaustedOffset.x)
		expect(loadingOffset.x).toBeLessThan(exhaustedOffset.x + 120)
		expect(loadingOffset.y).toBeLessThan(exhaustedOffset.y)
		expect(loadingOffset.y).toBeGreaterThan(exhaustedOffset.y - 120)
	})

	it("drags the canvas when the pointer starts on template cover tiles", () => {
		renderCanvas()
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(getFirstTestElement("slides-template-cover-tile"), "pointerdown", {
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

		expect(screen.getByTestId("slides-template-canvas-content")).toHaveStyle({
			transform: "translate3d(50px, 25px, 0) scale(1)",
		})
	})

	it("zooms the canvas with mouse wheel around the pointer", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 120,
		})

		expect(screen.getByTestId("slides-template-canvas-content").style.transform).toMatch(
			/scale\(0\./,
		)
	})

	it("zooms and resets the canvas from the bottom-right controls", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("100%")
		fireEvent.click(screen.getByTestId("slides-template-canvas-zoom-out"))
		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("90%")

		fireEvent.click(screen.getByTestId("slides-template-canvas-reset"))
		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("100%")
		expect(getCanvasTranslate()).toEqual({ x: 0, y: 0 })
	})

	it("moves the canvas from the edge direction controls", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.click(screen.getByTestId("slides-template-canvas-move-right"))

		expect(getCanvasTranslate().x).toBeLessThan(0)
	})

	it("counter-scales template cover action buttons after canvas zoom", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1, 2)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)
		const content = screen.getByTestId("slides-template-canvas-content")
		const actions = getFirstTestElement("slides-template-cover-actions")

		expect(content.style.getPropertyValue("--slides-template-canvas-action-scale")).toBe("1")
		expect(actions.className).toContain(
			"[transform:scale(var(--slides-template-canvas-action-scale,1))]",
		)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 120,
		})

		expect(
			Number(content.style.getPropertyValue("--slides-template-canvas-action-scale")),
		).toBeGreaterThan(1)
	})

	it("requests more templates when zooming out exposes loaded edges", () => {
		const onLoadMore = vi.fn()
		renderCanvas([template], vi.fn(), { onLoadMore })
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 120,
		})

		expect(onLoadMore).toHaveBeenCalledTimes(1)
	})

	it("requests more templates when loaded covers do not fill the viewport", async () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)
		const onLoadMore = vi.fn()

		try {
			renderCanvas([template], vi.fn(), { onLoadMore })

			await waitFor(() => {
				expect(onLoadMore).toHaveBeenCalledTimes(1)
			})
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("prefetches before the viewport reaches the loaded canvas edge", () => {
		expect(getLoadMoreThreshold(800, 600)).toBe(640)
		expect(getLoadMoreThreshold(1440, 900)).toBe(960)
	})

	it("slightly enlarges sparse exhausted results", () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)

		try {
			renderCanvas([template], vi.fn(), { hasMore: false })

			expect(screen.getByTestId("slides-template-canvas-content").style.transform).toContain(
				"scale(1.16)",
			)
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("pans the canvas with trackpad wheel movement", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 24,
		})

		expect(screen.getByTestId("slides-template-canvas-content")).toHaveStyle({
			transform: "translate3d(0px, -24px, 0) scale(1)",
		})
	})

	it("keeps fast deltas in the same trackpad gesture as canvas movement", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 24,
		})
		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 120,
		})

		expect(screen.getByTestId("slides-template-canvas-content")).toHaveStyle({
			transform: "translate3d(0px, -144px, 0) scale(1)",
		})
	})

	it("keeps the current canvas position when the bottom inset changes", () => {
		const templates = Array.from({ length: 120 }, (_, index) => createTemplate(index + 1))
		const props = {
			templates,
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: true,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
			resetKey: "all:",
		}
		const { rerender } = render(
			<SlidesTemplateCanvas {...props} viewportInsets={{ bottom: 40 }} />,
		)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(canvas, {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 24,
		})
		expect(getCanvasTranslate().y).toBe(-24)

		rerender(<SlidesTemplateCanvas {...props} viewportInsets={{ bottom: 200 }} />)

		expect(getCanvasTranslate().y).toBe(-24)
	})
})
