import type { ComponentProps } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EditorSidebar } from "../EditorSidebar"

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

describe("EditorSidebar", () => {
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
})
