import type { ComponentProps } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EditorSidebar } from "../EditorSidebar"
import { STRUCTURE_MIN_HEIGHT, STYLES_MIN_HEIGHT } from "../sidebarSplit"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

function renderSidebar(overrides: Partial<ComponentProps<typeof EditorSidebar>> = {}) {
	const props = {
		structureExpanded: true,
		stylesExpanded: true,
		onStructureExpandedChange: vi.fn(),
		onStylesExpandedChange: vi.fn(),
		structure: <div data-testid="structure-slot">structure</div>,
		styles: <div data-testid="styles-slot">styles</div>,
		...overrides,
	}
	return { ...render(<EditorSidebar {...props} />), props }
}

let observedRailHeight = 406

class ResizeObserverMock {
	callback: ResizeObserverCallback

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback
	}

	observe(target: Element) {
		this.callback(
			[
				{
					target,
					contentRect: {
						height: observedRailHeight,
						width: 400,
						top: 0,
						left: 0,
						bottom: observedRailHeight,
						right: 400,
						x: 0,
						y: 0,
						toJSON: () => ({}),
					},
					borderBoxSize: [],
					contentBoxSize: [],
					devicePixelContentBoxSize: [],
				},
			],
			this as unknown as ResizeObserver,
		)
	}

	unobserve() {
		return undefined
	}

	disconnect() {
		return undefined
	}
}

describe("EditorSidebar", () => {
	beforeEach(() => {
		observedRailHeight = 406
		vi.stubGlobal("ResizeObserver", ResizeObserverMock)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("renders both sections, a splitter, and rail chrome", () => {
		renderSidebar()

		expect(screen.getByTestId("html-editor-sidebar")).toHaveAttribute(
			"aria-label",
			"stylePanel.sidebar.title",
		)
		expect(screen.getByTestId("html-editor-sidebar-structure")).toBeInTheDocument()
		expect(screen.getByTestId("html-editor-sidebar-styles")).toBeInTheDocument()
		expect(screen.getByTestId("html-editor-sidebar-splitter")).toBeInTheDocument()
		expect(screen.getByTestId("html-editor-sidebar-resize-handle")).toHaveClass("z-30")
		expect(screen.getByTestId("html-editor-sidebar-structure-chrome")).toBeInTheDocument()
		expect(screen.queryByTestId("html-editor-sidebar-close-button")).not.toBeInTheDocument()
		expect(screen.getByTestId("structure-slot")).toBeInTheDocument()
		expect(screen.getByTestId("styles-slot")).toBeInTheDocument()
	})

	it("hides the splitter and collapsed section body", () => {
		renderSidebar({ stylesExpanded: false })

		expect(screen.queryByTestId("html-editor-sidebar-splitter")).not.toBeInTheDocument()
		expect(screen.queryByTestId("styles-slot")).not.toBeInTheDocument()
		expect(screen.getByTestId("structure-slot")).toBeInTheDocument()
	})

	it("toggles a section from its header", () => {
		const { props } = renderSidebar()

		fireEvent.click(screen.getByTestId("html-editor-sidebar-styles-toggle"))
		expect(props.onStylesExpandedChange).toHaveBeenCalledWith(false)
	})

	it("clamps section heights when the rail is shorter than both minima", () => {
		renderSidebar()

		expect(screen.getByTestId("html-editor-sidebar-structure")).toHaveStyle({
			height: `${STRUCTURE_MIN_HEIGHT}px`,
		})
		expect(screen.getByTestId("html-editor-sidebar-styles")).toHaveStyle({
			height: `${STYLES_MIN_HEIGHT}px`,
		})
	})
})
