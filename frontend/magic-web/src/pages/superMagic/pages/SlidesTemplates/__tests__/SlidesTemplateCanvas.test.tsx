import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "../SlidesTemplateCanvas"
import { getLoadMoreThreshold } from "../canvasInteraction"
import { MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS } from "../canvasViewport"
import { SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS } from "../useSlidesTemplateCanvasIdle"

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
		selectedTemplate = null,
	}: {
		hasMore?: boolean
		onLoadMore?: () => void
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

function getVisibleSourceTemplateSnapshot() {
	return screen
		.getAllByTestId("slides-template-canvas-tile-item")
		.filter((item) => item.dataset.slidesTemplateLayoutFiller !== "true")
		.map((item) => {
			const image = item.querySelector("img")
			return `${item.style.transform}|${image?.getAttribute("alt") ?? ""}`
		})
		.sort()
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
			transform: "translate3d(50px, 25px, 0) scale(0.8)",
		})
		expect(setPointerCapture).toHaveBeenCalledWith(1)
	})

	it("constrains dragging when finite templates are exhausted", () => {
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

	it("keeps movement available while more templates can load", () => {
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

		expect(exhaustedOffset).toEqual({ x: 0, y: 0 })
		expect(loadingOffset.x).toBeLessThan(exhaustedOffset.x)
		expect(loadingOffset.x).toBeGreaterThan(exhaustedOffset.x - 120)
	})

	it("allows finite canvas dragging within its content bounds", () => {
		renderCanvas(
			Array.from({ length: 12 }, (_, index) => createTemplate(index + 1)),
			vi.fn(),
			{
				hasMore: false,
			},
		)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)
		const initialOffset = getCanvasTranslate()

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: -500,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		const movedOffset = getCanvasTranslate()

		expect(movedOffset.x).toBe(initialOffset.x - 600)

		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: -5000,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		const boundedOffset = getCanvasTranslate()

		expect(boundedOffset.x).toBeLessThan(movedOffset.x)
		expect(boundedOffset.x).toBeGreaterThan(-2_000)
	})

	it("returns a finite canvas to its bounds when loading is exhausted", () => {
		const props = {
			templates: [template],
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
			resetKey: "all:",
		}
		const { rerender } = render(<SlidesTemplateCanvas {...props} hasMore />)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 500,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: -5000,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		expect(getCanvasTranslate().x).toBeLessThan(0)

		rerender(<SlidesTemplateCanvas {...props} hasMore={false} />)

		expect(getCanvasTranslate()).toEqual({ x: 0, y: 0 })
	})

	it("keeps looped templates draggable after the source is exhausted", () => {
		const templates = Array.from({ length: 36 }, (_, index) => createTemplate(index + 1))
		renderCanvas(templates, vi.fn(), { hasMore: false })
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

		expect(getCanvasTranslate()).toEqual({ x: 4900, y: -4100 })
	})

	it("keeps the repeated canvas DOM bounded after a distant drag", async () => {
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
			clientX: -50_000,
			clientY: 40_000,
			isPrimary: true,
			pointerId: 1,
		})

		await waitFor(() => {
			const renderedTiles = screen.getAllByTestId("slides-template-canvas-tile-item")
			expect(renderedTiles.length).toBeGreaterThan(0)
			expect(renderedTiles.length).toBeLessThanOrEqual(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
		})
	})

	it("continues dragging from the rebased offset after more templates arrive", () => {
		const initialTemplates = Array.from({ length: 12 }, (_, index) => createTemplate(index + 1))
		const nextTemplates = Array.from({ length: 24 }, (_, index) => createTemplate(index + 1))
		const props = {
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
			<SlidesTemplateCanvas {...props} templates={initialTemplates} />,
		)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 400,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: -5000,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})

		rerender(<SlidesTemplateCanvas {...props} templates={nextTemplates} />)
		const rebasedOffset = getCanvasTranslate()

		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: -4990,
			clientY: 306,
			isPrimary: true,
			pointerId: 1,
		})

		expect(getCanvasTranslate()).toEqual({
			x: rebasedOffset.x + 10,
			y: rebasedOffset.y + 6,
		})
	})

	it("keeps applying pointer deltas while loading more", () => {
		const templates = Array.from({ length: 24 }, (_, index) => createTemplate(index + 1))
		const props = {
			templates,
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: true,
			isLoading: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
			resetKey: "all:",
		}
		const { rerender } = render(<SlidesTemplateCanvas {...props} isLoadingMore={false} />)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 400,
			clientY: 300,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 300,
			clientY: 260,
			isPrimary: true,
			pointerId: 1,
		})

		rerender(<SlidesTemplateCanvas {...props} isLoadingMore />)
		const loadingOffset = getCanvasTranslate()
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 270,
			clientY: 240,
			isPrimary: true,
			pointerId: 1,
		})

		expect(getCanvasTranslate()).toEqual({
			x: loadingOffset.x - 30,
			y: loadingOffset.y - 20,
		})
	})

	it("waits for drag release before auto-loading from appended templates", () => {
		vi.useFakeTimers()
		const requestAnimationFrameSpy = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) =>
				window.setTimeout(() => callback(performance.now()), 16),
			)
		const cancelAnimationFrameSpy = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation((frameId) => window.clearTimeout(frameId))
		const onLoadMore = vi.fn()
		const initialTemplates = [template]
		const appendedTemplates = [...initialTemplates, createTemplate(2)]
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: true,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore,
			resetKey: "all:",
		}

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas
					{...props}
					isLoading
					loadMoreSignal={initialTemplates.length}
					templates={initialTemplates}
				/>,
			)
			const canvas = screen.getByTestId("slides-template-canvas")
			mockCanvasRect(canvas)

			fireCanvasPointerEvent(canvas, "pointerdown", {
				clientX: 400,
				clientY: 300,
				pointerId: 1,
			})
			fireCanvasPointerEvent(canvas, "pointermove", {
				clientX: 450,
				clientY: 300,
				pointerId: 1,
			})

			rerender(
				<SlidesTemplateCanvas
					{...props}
					isLoading={false}
					loadMoreSignal={appendedTemplates.length}
					templates={appendedTemplates}
				/>,
			)
			act(() => vi.advanceTimersByTime(20))
			expect(onLoadMore).not.toHaveBeenCalled()

			fireCanvasPointerEvent(canvas, "pointerup", {
				clientX: 450,
				clientY: 300,
				pointerId: 1,
			})
			act(() => vi.advanceTimersByTime(20))
			expect(onLoadMore).toHaveBeenCalledTimes(1)
		} finally {
			requestAnimationFrameSpy.mockRestore()
			cancelAnimationFrameSpy.mockRestore()
			vi.useRealTimers()
		}
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
			transform: "translate3d(50px, 25px, 0) scale(0.8)",
		})
	})

	it("deprioritizes newly visible cover images while dragging", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		expect(
			screen
				.getAllByTestId("slides-template-static-cover")
				.some((cover) => cover.querySelector('img[loading="eager"]')),
		).toBe(true)

		fireCanvasPointerEvent(canvas, "pointerdown", {
			button: 0,
			clientX: 100,
			clientY: 100,
			isPrimary: true,
			pointerId: 1,
		})
		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 160,
			clientY: 130,
			isPrimary: true,
			pointerId: 1,
		})

		expect(
			screen
				.getAllByTestId("slides-template-static-cover")
				.every((cover) => cover.querySelector('img[loading="eager"]') === null),
		).toBe(true)

		fireCanvasPointerEvent(canvas, "pointerup", {
			clientX: 160,
			clientY: 130,
			isPrimary: true,
			pointerId: 1,
		})
		expect(
			screen
				.getAllByTestId("slides-template-static-cover")
				.some((cover) => cover.querySelector('img[loading="eager"]')),
		).toBe(true)
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

		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("80%")
		fireEvent.click(screen.getByTestId("slides-template-canvas-zoom-out"))
		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("70%")

		fireEvent.click(screen.getByTestId("slides-template-canvas-reset"))
		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("80%")
		expect(getCanvasTranslate()).toEqual({ x: 0, y: 0 })
	})

	it("keeps the zoom scale when the filtered collection changes", () => {
		const templates = Array.from({ length: 120 }, (_, index) => createTemplate(index + 1))
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: false,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
		}
		const { rerender } = render(
			<SlidesTemplateCanvas {...props} resetKey="category:all" templates={templates} />,
		)

		fireEvent.click(screen.getByTestId("slides-template-canvas-zoom-out"))
		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("70%")

		rerender(
			<SlidesTemplateCanvas
				{...props}
				resetKey="category:business"
				templates={templates.slice(0, 24)}
			/>,
		)

		expect(screen.getByTestId("slides-template-canvas-scale")).toHaveTextContent("70%")
		expect(screen.getByTestId("slides-template-canvas-content").style.transform).toMatch(
			/scale\(0\.7/,
		)
	})

	it("still auto-fits when the first filtered result arrives after a reset", () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas
					templates={[]}
					selectedTemplate={null}
					onTemplateSelect={vi.fn()}
					hasMore={false}
					isLoading={false}
					isLoadingMore={false}
					isRefreshing={false}
					onLoadMore={vi.fn()}
					resetKey="category:loading"
				/>,
			)

			rerender(
				<SlidesTemplateCanvas
					templates={[template]}
					selectedTemplate={null}
					onTemplateSelect={vi.fn()}
					hasMore={false}
					isLoading={false}
					isLoadingMore={false}
					isRefreshing={false}
					onLoadMore={vi.fn()}
					resetKey="category:business"
				/>,
			)

			expect(screen.getByTestId("slides-template-canvas-content").style.transform).toContain(
				"scale(1.16)",
			)
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("moves the canvas from the edge direction controls", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.click(screen.getByTestId("slides-template-canvas-move-right"))

		expect(getCanvasTranslate().x).toBeLessThan(0)
	})

	it("updates the cursor for the canvas edge hot zones", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 20,
			clientY: 20,
			pointerId: 8,
		})
		expect(canvas).toHaveStyle({ cursor: "nw-resize" })

		fireCanvasPointerEvent(canvas, "pointermove", {
			clientX: 400,
			clientY: 300,
			pointerId: 8,
		})
		expect(canvas).toHaveStyle({ cursor: "grab" })

		fireEvent.pointerLeave(canvas, { clientX: -2, clientY: 300, pointerId: 8 })
	})

	it("counter-scales template cover action buttons after canvas zoom", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1, 2)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)
		const content = screen.getByTestId("slides-template-canvas-content")
		const actions = getFirstTestElement("slides-template-cover-actions")

		expect(content.style.getPropertyValue("--slides-template-canvas-action-scale")).toBe("1.25")
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

	it("explores while the pointer is away and stops as soon as it enters the canvas", () => {
		vi.useFakeTimers()
		const requestAnimationFrameSpy = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) =>
				window.setTimeout(() => callback(performance.now()), 16),
			)
		const cancelAnimationFrameSpy = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation((frameId) => window.clearTimeout(frameId))
		const performanceNowSpy = vi.spyOn(performance, "now").mockImplementation(() => Date.now())

		try {
			renderCanvas(
				Array.from({ length: 36 }, (_, index) => createTemplate(index + 1)),
				vi.fn(),
				{ hasMore: false },
			)
			const canvas = screen.getByTestId("slides-template-canvas")
			mockCanvasRect(canvas)

			act(() => vi.advanceTimersByTime(SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS))
			act(() => vi.advanceTimersByTime(1000))
			const exploringOffset = getCanvasTranslate()
			expect(exploringOffset.x).toBeLessThan(0)
			expect(exploringOffset.y).toBeLessThan(0)

			fireEvent.pointerEnter(canvas, { clientX: 400, clientY: 300 })
			act(() => vi.advanceTimersByTime(1000))
			expect(getCanvasTranslate()).toEqual(exploringOffset)
		} finally {
			performanceNowSpy.mockRestore()
			requestAnimationFrameSpy.mockRestore()
			cancelAnimationFrameSpy.mockRestore()
			vi.useRealTimers()
		}
	})

	it("stops the idle template loop after a template is selected", async () => {
		const templates = Array.from({ length: 120 }, (_, index) => createTemplate(index + 1))
		renderCanvas(templates, vi.fn(), { selectedTemplate: templates[0] })

		await waitFor(() => {
			expect(
				screen.queryAllByTestId("slides-template-static-cover").every((cover) => {
					return cover.dataset.slidesTemplateIdleAnimation === "false"
				}),
			).toBe(true)
		})
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

	it("does not reload the same loop after a page extends the loaded template count", () => {
		vi.useFakeTimers()
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)
		const requestAnimationFrameSpy = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) =>
				window.setTimeout(() => callback(performance.now()), 16),
			)
		const cancelAnimationFrameSpy = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation((frameId) => window.clearTimeout(frameId))
		const onLoadMore = vi.fn()
		const initialTemplates = Array.from({ length: 40 }, (_, index) => createTemplate(index + 1))
		const appendedTemplates = [
			...initialTemplates,
			...Array.from({ length: 40 }, (_, index) => createTemplate(index + 41)),
		]
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: true,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore,
			resetKey: "similar-colors:",
		}

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas
					{...props}
					loadMoreSignal={initialTemplates.length}
					templates={initialTemplates}
				/>,
			)

			act(() => vi.advanceTimersByTime(20))
			expect(onLoadMore).toHaveBeenCalledTimes(1)
			act(() => vi.advanceTimersByTime(500))

			rerender(
				<SlidesTemplateCanvas
					{...props}
					loadMoreSignal={appendedTemplates.length}
					templates={appendedTemplates}
				/>,
			)

			act(() => vi.advanceTimersByTime(20))
			expect(onLoadMore).toHaveBeenCalledTimes(1)
		} finally {
			requestAnimationFrameSpy.mockRestore()
			cancelAnimationFrameSpy.mockRestore()
			rectSpy.mockRestore()
			vi.useRealTimers()
		}
	})

	it("keeps existing cards fixed while an appended page fills a visible gap", async () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)
		const initialTemplates = Array.from({ length: 40 }, (_, index) => createTemplate(index + 1))
		const appendedTemplates = [
			...initialTemplates,
			...Array.from({ length: 40 }, (_, index) => createTemplate(index + 41)),
		]
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: true,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
			resetKey: "all:",
		}

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas {...props} templates={initialTemplates} />,
			)
			const initialSnapshot = getVisibleSourceTemplateSnapshot()

			rerender(<SlidesTemplateCanvas {...props} templates={appendedTemplates} />)

			await waitFor(() => {
				const appendedSnapshot = getVisibleSourceTemplateSnapshot()
				expect(initialSnapshot.every((item) => appendedSnapshot.includes(item))).toBe(true)
			})
			expect(screen.getByAltText("Template 48")).toBeInTheDocument()
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("replaces preserved cards when a new filtered collection has more templates", async () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)
		const initialTemplates = Array.from({ length: 40 }, (_, index) => createTemplate(index + 1))
		const replacementTemplates = Array.from({ length: 80 }, (_, index) =>
			createTemplate(index + 101),
		)
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: false,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
		}

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas
					{...props}
					resetKey="filtered:1"
					templates={initialTemplates}
				/>,
			)

			rerender(
				<SlidesTemplateCanvas
					{...props}
					resetKey="filtered:2"
					templates={replacementTemplates}
				/>,
			)

			await waitFor(() => {
				expect(screen.getAllByAltText(/Template 1\d\d/).length).toBeGreaterThan(0)
			})
			expect(screen.queryByAltText("Template 1")).not.toBeInTheDocument()
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("does not preserve the search layout when clearing search restores the loop", async () => {
		const rectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue(CANVAS_RECT)
		const categoryTemplates = Array.from({ length: 80 }, (_, index) =>
			createTemplate(index + 101),
		)
		const searchTemplates = Array.from({ length: 40 }, (_, index) => createTemplate(index + 1))
		const props = {
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: false,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
		}

		try {
			const { rerender } = render(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop
					resetKey="category:1"
					templates={categoryTemplates}
				/>,
			)
			fireEvent.click(screen.getByTestId("slides-template-canvas-zoom-out"))
			fireEvent.click(screen.getByTestId("slides-template-canvas-zoom-out"))

			// 输入搜索词会先关闭循环，服务端搜索结果随后替换当前分类。
			rerender(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop={false}
					resetKey="category:1"
					templates={categoryTemplates}
				/>,
			)
			rerender(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop={false}
					resetKey="search:1"
					templates={searchTemplates}
				/>,
			)

			// 清除搜索时循环先恢复；「全部」首批结果进入预取阶段时，画布会先清空。
			rerender(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop
					resetKey="search:1"
					templates={searchTemplates}
				/>,
			)
			rerender(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop={false}
					resetKey="category:2"
					templates={[]}
				/>,
			)
			expect(screen.queryByAltText("Template 1")).not.toBeInTheDocument()
			expect(screen.queryAllByTestId("slides-template-canvas-tile-item")).toHaveLength(0)

			// 预取完成后，同一个 resetKey 提交完整分类布局。
			rerender(
				<SlidesTemplateCanvas
					{...props}
					enableInfiniteLoop
					resetKey="category:2"
					templates={categoryTemplates}
				/>,
			)

			await waitFor(() => {
				expect(screen.getAllByAltText(/Template 1\d\d/).length).toBeGreaterThan(0)
			})
			expect(screen.queryByAltText("Template 1")).not.toBeInTheDocument()

			const renderedPositions = screen
				.getAllByTestId("slides-template-canvas-tile-item")
				.filter((item) => item.dataset.slidesTemplateLayoutFiller !== "true")
				.map((item) => item.style.transform)
			expect(new Set(renderedPositions).size).toBe(renderedPositions.length)
		} finally {
			rectSpy.mockRestore()
		}
	})

	it("shows a retry action when refreshing the filtered collection fails", () => {
		const onRetryRefresh = vi.fn()
		render(
			<SlidesTemplateCanvas
				templates={[template]}
				selectedTemplate={null}
				onTemplateSelect={vi.fn()}
				hasMore={false}
				isLoading={false}
				isLoadingMore={false}
				isRefreshFailed
				isRefreshing={false}
				onLoadMore={vi.fn()}
				onRetryRefresh={onRetryRefresh}
				resetKey="all:"
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "playbook.edit.presets.form.retry" }))

		expect(onRetryRefresh).toHaveBeenCalledTimes(1)
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
			transform: "translate3d(0px, -24px, 0) scale(0.8)",
		})
	})

	it("keeps canvas wheel navigation active while the pointer is over a card action", () => {
		renderCanvas(Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)))
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		fireEvent.wheel(getFirstTestElement("slides-template-cover-select-button"), {
			clientX: 400,
			clientY: 300,
			deltaMode: 0,
			deltaY: 24,
		})

		expect(screen.getByTestId("slides-template-canvas-content")).toHaveStyle({
			transform: "translate3d(0px, -24px, 0) scale(0.8)",
		})
	})

	it("cancels pending edge movement before starting idle exploration after the pointer leaves", () => {
		vi.useFakeTimers()
		const requestAnimationFrameSpy = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((callback) =>
				window.setTimeout(() => callback(performance.now()), 16),
			)
		const cancelAnimationFrameSpy = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation((frameId) => window.clearTimeout(frameId))

		try {
			renderCanvas(
				Array.from({ length: 120 }, (_, index) => createTemplate(index + 1)),
				vi.fn(),
				{
					hasMore: false,
				},
			)
			const canvas = screen.getByTestId("slides-template-canvas")
			mockCanvasRect(canvas)

			fireCanvasPointerEvent(canvas, "pointermove", {
				clientX: 2,
				clientY: 300,
				pointerId: 7,
			})
			act(() => vi.advanceTimersByTime(100))
			expect(getCanvasTranslate()).toEqual({ x: 0, y: 0 })

			fireEvent.pointerLeave(canvas, { clientX: -2, clientY: 300, pointerId: 7 })
			act(() => vi.advanceTimersByTime(500))
			const idleOffset = getCanvasTranslate()
			expect(idleOffset.x).toBeLessThan(0)
			expect(idleOffset.x).toBeGreaterThan(-20)
			expect(idleOffset.y).toBeLessThan(0)
			expect(idleOffset.y).toBeGreaterThan(-20)
		} finally {
			requestAnimationFrameSpy.mockRestore()
			cancelAnimationFrameSpy.mockRestore()
			vi.useRealTimers()
		}
	})

	it("centers and highlights a random template from the current filtered items", async () => {
		const templates = Array.from(
			{ length: 120 },
			(_, index): OptionItem => ({
				...createTemplate(index + 1),
				...(index % 11 === 0
					? {
							tags: [
								{
									code: "featured",
									id: `featured-${index}`,
									name_i18n: { en_US: "Featured", zh_CN: "精选" },
								},
							],
						}
					: {}),
			}),
		)
		const canvasRef = createRef<SlidesTemplateCanvasHandle>()
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.75)

		try {
			render(
				<SlidesTemplateCanvas
					ref={canvasRef}
					templates={templates}
					selectedTemplate={null}
					onTemplateSelect={vi.fn()}
					hasMore={false}
					isLoading={false}
					isLoadingMore={false}
					isRefreshing={false}
					onLoadMore={vi.fn()}
					resetKey="business:"
				/>,
			)
			const canvas = screen.getByTestId("slides-template-canvas")
			mockCanvasRect(canvas)

			let didFocus = false
			act(() => {
				didFocus = canvasRef.current?.focusRandomTemplate() ?? false
			})

			expect(didFocus).toBe(true)
			// 随机聚焦先保留当前位置，再通过 requestAnimationFrame 平滑移动到目标。
			expect(getCanvasTranslate()).toEqual({ x: 0, y: 0 })
			const getFocusedCover = () =>
				screen
					.getAllByTestId("slides-template-canvas-tile-item")
					.find((item) => item.style.zIndex === "30")
					?.querySelector('[data-testid="slides-template-static-cover"]')
			const getFocusedTile = () =>
				screen
					.getAllByTestId("slides-template-canvas-tile-item")
					.find((item) => item.style.zIndex === "30")
			expect(getFocusedTile()).not.toHaveAttribute(
				"data-slides-template-layout-filler",
				"true",
			)
			expect(getFocusedCover()).toHaveAttribute(
				"data-slides-template-emphasis-ready",
				"false",
			)
			await waitFor(() => {
				expect(getCanvasTranslate()).not.toEqual({ x: 0, y: 0 })
			})
			await waitFor(
				() => {
					expect(getFocusedCover()).toHaveAttribute(
						"data-slides-template-emphasis-ready",
						"true",
					)
				},
				{ timeout: 2500 },
			)
			await waitFor(
				() => {
					expect(
						screen
							.getAllByTestId("slides-template-canvas-tile-item")
							.some((item) => item.style.zIndex === "30"),
					).toBe(true)
				},
				{ timeout: 2500 },
			)
		} finally {
			randomSpy.mockRestore()
		}
	})

	it("retries the first random focus after the initial templates become available", async () => {
		const canvasRef = createRef<SlidesTemplateCanvasHandle>()
		const props = {
			ref: canvasRef,
			selectedTemplate: null,
			onTemplateSelect: vi.fn(),
			hasMore: false,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			onLoadMore: vi.fn(),
		}
		const { rerender } = render(
			<SlidesTemplateCanvas {...props} templates={[]} resetKey="initial-loading" />,
		)
		const canvas = screen.getByTestId("slides-template-canvas")
		mockCanvasRect(canvas)

		let didFocusImmediately = true
		act(() => {
			didFocusImmediately = canvasRef.current?.focusRandomTemplate() ?? false
		})
		expect(didFocusImmediately).toBe(false)

		rerender(
			<SlidesTemplateCanvas
				{...props}
				templates={Array.from({ length: 120 }, (_, index) => createTemplate(index + 1))}
				resetKey="initial-ready"
			/>,
		)

		await waitFor(() => {
			expect(
				screen
					.getAllByTestId("slides-template-canvas-tile-item")
					.some((item) => item.style.zIndex === "30"),
			).toBe(true)
		})
		await waitFor(() => {
			expect(getCanvasTranslate()).not.toEqual({ x: 0, y: 0 })
		})
	})

	it("gives higher-sort templates priority when choosing a random focus", () => {
		const templates = [
			{ ...createTemplate(1), sort: 10 },
			{ ...createTemplate(2), sort: 100 },
			{ ...createTemplate(3), sort: 50 },
		]
		const canvasRef = createRef<SlidesTemplateCanvasHandle>()
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)

		try {
			render(
				<SlidesTemplateCanvas
					ref={canvasRef}
					templates={templates}
					selectedTemplate={null}
					onTemplateSelect={vi.fn()}
					hasMore={false}
					isLoading={false}
					isLoadingMore={false}
					isRefreshing={false}
					onLoadMore={vi.fn()}
					resetKey="business:"
				/>,
			)
			const canvas = screen.getByTestId("slides-template-canvas")
			mockCanvasRect(canvas)

			act(() => {
				canvasRef.current?.focusRandomTemplate()
			})

			const focusedItem = screen
				.getAllByTestId("slides-template-canvas-tile-item")
				.find((item) => item.style.zIndex === "30")
			expect(focusedItem?.querySelector('img[alt="Template 2"]')).toBeInTheDocument()
		} finally {
			randomSpy.mockRestore()
		}
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
			transform: "translate3d(0px, -144px, 0) scale(0.8)",
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
