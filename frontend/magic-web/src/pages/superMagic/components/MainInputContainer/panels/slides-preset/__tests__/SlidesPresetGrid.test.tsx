import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { OptionItem } from "../../types"
import SlidesPresetGrid from "../SlidesPresetGrid"

const intersectionObserverInstances: Array<{
	callback: IntersectionObserverCallback
	observedElements: Set<Element>
	disconnect: ReturnType<typeof vi.fn>
	observe: ReturnType<typeof vi.fn>
	unobserve: ReturnType<typeof vi.fn>
}> = []

function mockPointerDevice({
	canHover,
	maxTouchPoints,
}: {
	canHover: boolean
	maxTouchPoints: number
}) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: canHover && query === "(hover: hover) and (pointer: fine)",
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})

	Object.defineProperty(window.navigator, "maxTouchPoints", {
		configurable: true,
		value: maxTouchPoints,
	})
}

function notifyIntersection(target: Element, isIntersecting = true) {
	for (const instance of intersectionObserverInstances) {
		if (!instance.observedElements.has(target)) continue

		instance.callback(
			[
				{
					isIntersecting,
					target,
				} as IntersectionObserverEntry,
			],
			instance as unknown as IntersectionObserver,
		)
	}
}

describe("SlidesPresetGrid", () => {
	beforeAll(() => {
		vi.stubGlobal(
			"IntersectionObserver",
			vi.fn((callback: IntersectionObserverCallback) => {
				const observedElements = new Set<Element>()
				const instance = {
					callback,
					observedElements,
					disconnect: vi.fn(() => observedElements.clear()),
					observe: vi.fn((element: Element) => observedElements.add(element)),
					unobserve: vi.fn((element: Element) => observedElements.delete(element)),
				}

				intersectionObserverInstances.push(instance)

				return instance
			}),
		)
	})

	beforeEach(() => {
		intersectionObserverInstances.length = 0
		mockPointerDevice({ canHover: true, maxTouchPoints: 0 })
	})

	afterAll(() => {
		vi.unstubAllGlobals()
	})

	const mockTemplates: OptionItem[] = [
		{
			value: "academic-research",
			label: "Academic Research",
			thumbnail_url: "https://example.com/academic.png",
			preview_image_urls: [
				"https://example.com/academic-page-1.png",
				"https://example.com/academic-page-2.png",
			],
			preview_url: "https://example.com/academic-preview",
			preview_title: "Academic Preview",
		},
		{
			value: "tech-dark",
			label: "Tech Dark",
			thumbnail_url: "https://example.com/tech-dark.png",
			preview_url: "https://example.com/tech-dark-preview",
			preview_title: "Tech Dark Preview",
		},
	]

	it("renders slide preset cards", () => {
		render(<SlidesPresetGrid templates={mockTemplates} />)

		expect(screen.getByTestId("slides-preset-grid")).toBeInTheDocument()
		expect(screen.getByText("Academic Research")).toBeInTheDocument()
		expect(screen.getByText("Tech Dark")).toBeInTheDocument()
	})

	it("selects a template when card is clicked", () => {
		const handleTemplateClick = vi.fn()

		render(<SlidesPresetGrid templates={mockTemplates} onTemplateClick={handleTemplateClick} />)

		fireEvent.click(screen.getByText("Academic Research"))

		expect(handleTemplateClick).toHaveBeenCalledWith(mockTemplates[0])
	})

	it("keeps the selected template action visible", () => {
		render(<SlidesPresetGrid templates={mockTemplates} selectedTemplate={mockTemplates[0]} />)

		const useButton = screen.getAllByTestId("slides-preset-card-use-button")[0]

		expect(useButton).toHaveTextContent("playbook.edit.presets.form.selected")
		expect(useButton.className).toContain("opacity-100")
		expect(useButton.className).toContain("translate-y-0")
	})

	it("shows a lightweight refreshing indicator without hiding existing cards", () => {
		render(<SlidesPresetGrid templates={mockTemplates} isRefreshing />)

		expect(screen.getByTestId("slides-preset-grid-refreshing")).toBeInTheDocument()
		expect(screen.getByText("Academic Research")).toBeInTheDocument()
	})

	it("opens preview without selecting the template", () => {
		const handleTemplateClick = vi.fn()

		render(<SlidesPresetGrid templates={mockTemplates} onTemplateClick={handleTemplateClick} />)

		const previewButtons = screen.getAllByTestId("slides-preset-card-preview-button")
		fireEvent.click(previewButtons[0])

		expect(handleTemplateClick).not.toHaveBeenCalled()
		expect(screen.getByTestId("slides-preset-preview-dialog-content")).toBeInTheDocument()
		expect(screen.getByTestId("slides-preset-preview-dialog-pages")).toBeInTheDocument()
		expect(screen.getByRole("img", { name: "Academic Preview 1" })).toHaveAttribute(
			"src",
			"https://example.com/academic-page-1.png",
		)
		expect(screen.getByTestId("slides-preset-preview-dialog-page-index")).toHaveTextContent(
			"1 / 2",
		)

		fireEvent.click(screen.getByRole("button", { name: "Academic Preview 2" }))

		expect(screen.getByRole("img", { name: "Academic Preview 2" })).toHaveAttribute(
			"src",
			"https://example.com/academic-page-2.png",
		)
		expect(screen.getByTestId("slides-preset-preview-dialog-page-index")).toHaveTextContent(
			"2 / 2",
		)
	})

	it("preloads preview iframe after hovering a card for one second", () => {
		vi.useFakeTimers()

		try {
			render(<SlidesPresetGrid templates={mockTemplates} />)

			fireEvent.mouseEnter(screen.getAllByTestId("slides-preset-card")[0])

			act(() => {
				vi.advanceTimersByTime(999)
			})

			expect(
				screen.queryByTestId("slides-preset-preview-preload-iframe"),
			).not.toBeInTheDocument()

			act(() => {
				vi.advanceTimersByTime(1)
			})

			expect(screen.getByTestId("slides-preset-preview-preload-iframe")).toHaveAttribute(
				"src",
				"https://example.com/academic-preview",
			)
		} finally {
			vi.useRealTimers()
		}
	})

	it("does not preload preview iframe on touch devices", () => {
		mockPointerDevice({ canHover: true, maxTouchPoints: 5 })
		vi.useFakeTimers()

		try {
			render(<SlidesPresetGrid templates={mockTemplates} />)

			fireEvent.mouseEnter(screen.getAllByTestId("slides-preset-card")[0])

			act(() => {
				vi.advanceTimersByTime(1000)
			})

			expect(
				screen.queryByTestId("slides-preset-preview-preload-iframe"),
			).not.toBeInTheDocument()
		} finally {
			vi.useRealTimers()
		}
	})

	it("loads more when the grid scrolls near the bottom", () => {
		const handleLoadMore = vi.fn()

		render(<SlidesPresetGrid templates={mockTemplates} hasMore onLoadMore={handleLoadMore} />)

		const grid = screen.getByTestId("slides-preset-grid")
		Object.defineProperty(grid, "scrollHeight", { value: 1000, configurable: true })
		Object.defineProperty(grid, "clientHeight", { value: 300, configurable: true })
		Object.defineProperty(grid, "scrollTop", { value: 620, configurable: true })

		fireEvent.scroll(grid)

		expect(handleLoadMore).toHaveBeenCalledTimes(1)
	})

	it("loads more when the bottom sentinel enters the viewport", () => {
		const handleLoadMore = vi.fn()

		render(<SlidesPresetGrid templates={mockTemplates} hasMore onLoadMore={handleLoadMore} />)

		notifyIntersection(screen.getByTestId("slides-preset-grid-load-more-sentinel"))

		expect(handleLoadMore).toHaveBeenCalledTimes(1)
	})

	it("deduplicates repeated near-bottom scroll events before loading state updates", () => {
		const handleLoadMore = vi.fn()

		render(<SlidesPresetGrid templates={mockTemplates} hasMore onLoadMore={handleLoadMore} />)

		const grid = screen.getByTestId("slides-preset-grid")
		Object.defineProperty(grid, "scrollHeight", { value: 1000, configurable: true })
		Object.defineProperty(grid, "clientHeight", { value: 300, configurable: true })
		Object.defineProperty(grid, "scrollTop", { value: 620, configurable: true })

		fireEvent.scroll(grid)
		fireEvent.scroll(grid)

		expect(handleLoadMore).toHaveBeenCalledTimes(1)
	})

	it("does not load more while a load-more request is active", () => {
		const handleLoadMore = vi.fn()

		render(
			<SlidesPresetGrid
				templates={mockTemplates}
				hasMore
				isLoadingMore
				onLoadMore={handleLoadMore}
			/>,
		)

		const grid = screen.getByTestId("slides-preset-grid")
		Object.defineProperty(grid, "scrollHeight", { value: 1000, configurable: true })
		Object.defineProperty(grid, "clientHeight", { value: 300, configurable: true })
		Object.defineProperty(grid, "scrollTop", { value: 620, configurable: true })

		fireEvent.scroll(grid)

		expect(handleLoadMore).not.toHaveBeenCalled()
	})
})
