import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StylePanel } from "../StylePanel"

const {
	mockUpdateStyle,
	mockUpdateAttributes,
	mockSelectElement,
	mockSelectedElement,
	mockStylePanelStore,
} = vi.hoisted(() => {
	const mockSelectElement = vi.fn()

	return {
		mockUpdateStyle: vi.fn(),
		mockUpdateAttributes: vi.fn().mockResolvedValue(undefined),
		mockSelectElement,
		mockSelectedElement: {
			current: {
				selector: "img.hero",
				tagName: "img",
				isImageElement: true,
				intrinsicWidth: 800,
				intrinsicHeight: 400,
				intrinsicAspectRatio: 2,
				computedStyles: {
					fontWeight: "400",
					fontStyle: "normal",
					textDecoration: "none",
					textAlign: "left",
					color: "#000000",
					width: "320px",
					height: "160px",
				},
			},
		},
		mockStylePanelStore: {
			selectedElements: [] as Array<unknown>,
			getSelectedSelectors: () => ["img.hero"],
			selectElement: mockSelectElement,
		},
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../hooks/useSelectedElement", () => ({
	useSelectedElement: function useSelectedElement() {
		return {
			selectedElement: mockSelectedElement.current,
			updateStyle: mockUpdateStyle,
			updateBatchStyles: mockUpdateStyle,
			updateAttributes: mockUpdateAttributes,
		}
	},
}))

vi.mock("../../../iframe-bridge/contexts/StylePanelContext", () => ({
	useStylePanelStore: () => mockStylePanelStore,
}))

vi.mock("@/hooks/useShowButtonText", () => ({
	useShowButtonText: () => true,
}))

vi.mock("../sections/LayoutSection", () => ({
	default: () => <div data-testid="layout-section" />,
}))

vi.mock("../sections/BackgroundSection", () => ({
	default: () => <div data-testid="background-section" />,
}))

vi.mock("../sections/BorderSection", () => ({
	default: () => <div data-testid="border-section" />,
}))

vi.mock("../sections/ShadowSection", () => ({
	default: () => <div data-testid="shadow-section" />,
}))

vi.mock("../controls", () => ({
	/** Mock style controls to keep the test focused on which toolbar entries are rendered. */
	HistoryActions: () => <div data-testid="history-actions" />,
	FontFamilySelector: () => <div data-testid="font-family-selector" />,
	FontSizeSelector: () => <div data-testid="font-size-selector" />,
	FontSizeAdjuster: () => <div data-testid="font-size-adjuster" />,
	TextFormatTools: () => <div data-testid="text-format-tools" />,
	TextAlignTools: ({
		mode,
		value,
		onAlign,
	}: {
		mode?: string
		value?: string
		onAlign?: (value: string) => void
	}) => (
		<button
			type="button"
			data-testid="text-align-tools"
			data-mode={mode}
			data-value={value}
			onClick={() => onAlign?.("center")}
		/>
	),
	ColorPicker: () => <div data-testid="color-picker" />,
	ElementActions: () => <div data-testid="element-actions" />,
	SizePopover: () => <div data-testid="style-popover-stylePanel.size" />,
	DimensionInput: () => <div data-testid="dimension-input" />,
	NumericDragInput: () => <div data-testid="numeric-drag-input" />,
	SpacingInput: () => <div data-testid="spacing-input" />,
	ContextMorePopover: ({
		fontFamilySelector,
		textContentField,
	}: {
		fontFamilySelector: ReactNode
		textContentField: ReactNode
	}) => {
		const [open, setOpen] = useState(false)
		return (
			<div>
				<button
					type="button"
					onClick={() => setOpen(true)}
					data-testid="style-panel-more-styles-trigger"
				>
					stylePanel.moreStyles
				</button>
				{open ? (
					<div data-testid="style-panel-more-styles-content">
						{fontFamilySelector}
						{textContentField}
					</div>
				) : null}
			</div>
		)
	},
	StylePopoverButton: ({ title, children }: { title: string; children: ReactNode }) => (
		<div data-testid={`style-popover-${title}`}>
			<span>{title}</span>
			<div>{children}</div>
		</div>
	),
}))

describe("StylePanel", () => {
	afterEach(() => {
		cleanup()
	})

	beforeEach(() => {
		mockUpdateStyle.mockReset()
		mockUpdateAttributes.mockReset()
		mockUpdateAttributes.mockResolvedValue(undefined)
		mockSelectElement.mockReset()
		mockSelectedElement.current = {
			selector: "img.hero",
			tagName: "img",
			isImageElement: true,
			intrinsicWidth: 800,
			intrinsicHeight: 400,
			intrinsicAspectRatio: 2,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "160px",
			},
		}
	})

	it("should render a dedicated size popover button for selected images", () => {
		render(<StylePanel editorRef={{ current: null }} />)

		expect(screen.getByTestId("style-popover-stylePanel.size")).toBeInTheDocument()
	})

	it("should hide text controls and show image controls for image nodes", () => {
		render(<StylePanel editorRef={{ current: null }} />)

		expect(screen.queryByTestId("font-family-selector")).not.toBeInTheDocument()
		expect(screen.queryByTestId("font-size-selector")).not.toBeInTheDocument()
		expect(screen.getByTestId("html-style-panel-image-section")).toBeInTheDocument()
	})

	it("should expose a DOM tree entry in the global toolbar", () => {
		render(
			<StylePanel
				editorRef={{ current: null }}
				variant="global"
				domTreeOpen={false}
				onToggleDomTree={vi.fn()}
			/>,
		)

		expect(screen.getByText("stylePanel.domTree.expandPageStructure")).toBeInTheDocument()
		expect(screen.getByLabelText("stylePanel.domTree.expandPageStructure")).toBeInTheDocument()
	})

	it("should keep the context toolbar horizontal and expose one more entry", () => {
		mockSelectedElement.current = {
			selector: "a.cta",
			tagName: "a",
			isTextElement: true,
			hasDirectTextContent: true,
			attributes: { href: "/docs", target: "_blank" },
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "40px",
			},
		}

		render(<StylePanel editorRef={{ current: null }} variant="context" />)

		expect(screen.queryByTestId("font-family-selector")).not.toBeInTheDocument()
		expect(screen.getByTestId("font-size-selector")).toBeInTheDocument()
		expect(screen.getByTestId("text-format-tools")).toBeInTheDocument()
		expect(screen.getByTestId("text-align-tools")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-styles-trigger")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))
		expect(screen.getByTestId("font-family-selector")).toBeInTheDocument()
		expect(document.querySelectorAll('[data-slot="separator"]')).toHaveLength(5)
	})

	it("should keep only font-size adjustment for containers with descendant-only text", () => {
		mockSelectedElement.current = {
			selector: "div.card",
			tagName: "div",
			isTextElement: true,
			hasDirectTextContent: false,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "120px",
			},
		}

		render(<StylePanel editorRef={{ current: null }} variant="context" />)

		expect(screen.queryByTestId("font-size-selector")).not.toBeInTheDocument()
		expect(screen.getByTestId("font-size-adjuster")).toBeInTheDocument()
		expect(screen.queryByTestId("text-format-tools")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))
		expect(screen.queryByText("stylePanel.textContent")).not.toBeInTheDocument()
	})

	it("hides text content editing when a container has no direct-text metadata", () => {
		mockSelectedElement.current = {
			selector: "div.legacy-card",
			tagName: "div",
			isTextElement: true,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "120px",
			},
		} as never

		render(<StylePanel editorRef={{ current: null }} variant="context" />)
		fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))

		expect(screen.queryByText("stylePanel.textContent")).not.toBeInTheDocument()
	})

	it("should show only font-size adjustment for an empty container", () => {
		mockSelectedElement.current = {
			selector: "div.empty",
			tagName: "div",
			isTextElement: false,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "120px",
			},
		}

		render(<StylePanel editorRef={{ current: null }} variant="context" />)

		expect(screen.queryByTestId("font-size-selector")).not.toBeInTheDocument()
		expect(screen.getByTestId("font-size-adjuster")).toBeInTheDocument()
		expect(screen.queryByTestId("text-format-tools")).not.toBeInTheDocument()
	})

	it("should render and commit text content from the more panel", async () => {
		mockSelectedElement.current = {
			selector: "p.copy",
			tagName: "p",
			isImageElement: false,
			isTextElement: true,
			hasDirectTextContent: true,
			textContent: "Initial text",
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "40px",
			},
		}
		const updateTextContent = vi.fn().mockResolvedValue(undefined)
		const editorRef = { current: { updateTextContent } } as never

		render(<StylePanel editorRef={editorRef} variant="context" />)

		fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))
		const input = screen.getByDisplayValue("Initial text")
		fireEvent.change(input, { target: { value: "Updated text" } })
		fireEvent.blur(input)

		await waitFor(() => {
			expect(updateTextContent).toHaveBeenCalledWith("p.copy", "Updated text")
			expect(mockSelectElement).toHaveBeenCalledWith(
				expect.objectContaining({ textContent: "Updated text" }),
			)
		})
	})

	it("should expose the more styles entry in context mode", () => {
		mockSelectedElement.current = {
			selector: "p.copy",
			tagName: "p",
			isTextElement: true,
			hasDirectTextContent: true,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "40px",
			},
		}
		render(<StylePanel editorRef={{ current: null }} variant="context" />)

		expect(screen.getByTestId("style-panel-more-styles-trigger")).toBeInTheDocument()
		expect(screen.queryByTestId("background-section")).not.toBeInTheDocument()
	})

	it("should use the parent flex container for alignment of a flex item", async () => {
		mockSelectedElement.current = {
			selector: "p.copy",
			tagName: "p",
			isTextElement: true,
			hasDirectTextContent: true,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "40px",
				display: "block",
				parentSelector: "div.layout",
				parentDisplay: "flex",
				parentFlexDirection: "row",
				parentJustifyContent: "flex-start",
			},
		}
		const setBatchStyles = vi.fn().mockResolvedValue(undefined)
		const refreshSelectedElement = vi.fn().mockResolvedValue(undefined)

		render(
			<StylePanel
				editorRef={{ current: { setBatchStyles, refreshSelectedElement } } as never}
				onStyleChange={mockUpdateStyle}
			/>,
		)

		const alignmentTools = screen.getByTestId("text-align-tools")
		expect(alignmentTools).toHaveAttribute("data-mode", "flex")
		expect(alignmentTools).toHaveAttribute("data-value", "flex-start")

		fireEvent.click(alignmentTools)

		await waitFor(() => {
			expect(setBatchStyles).toHaveBeenCalledWith("div.layout", {
				justifyContent: "center",
			})
			expect(refreshSelectedElement).toHaveBeenCalledWith("p.copy")
			expect(mockUpdateStyle).toHaveBeenCalledWith("div.layout", "justifyContent", "center")
		})
	})

	it("should keep text alignment for a regular text element", async () => {
		mockSelectedElement.current = {
			selector: "p.copy",
			tagName: "p",
			isTextElement: true,
			hasDirectTextContent: true,
			computedStyles: {
				fontWeight: "400",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "left",
				color: "#000000",
				width: "320px",
				height: "40px",
				display: "block",
			},
		}

		render(<StylePanel editorRef={{ current: null }} />)
		fireEvent.click(screen.getByTestId("text-align-tools"))

		await waitFor(() => {
			expect(mockUpdateStyle).toHaveBeenCalledWith("textAlign", "center")
		})
	})
})
