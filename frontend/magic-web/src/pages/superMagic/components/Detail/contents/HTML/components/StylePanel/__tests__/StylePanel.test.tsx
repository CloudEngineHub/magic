import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
	TextAlignTools: () => <div data-testid="text-align-tools" />,
	ColorPicker: () => <div data-testid="color-picker" />,
	ElementActions: () => <div data-testid="element-actions" />,
	SizePopover: () => <div data-testid="style-popover-stylePanel.size" />,
	DimensionInput: () => <div data-testid="dimension-input" />,
	NumericDragInput: () => <div data-testid="numeric-drag-input" />,
	SpacingInput: () => <div data-testid="spacing-input" />,
	StylePopoverButton: ({ title, children }: { title: string; children: ReactNode }) => (
		<div data-testid={`style-popover-${title}`}>
			<span>{title}</span>
			<div>{children}</div>
		</div>
	),
}))

describe("StylePanel", () => {
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

	it("should render common link settings and keep advanced settings collapsed", () => {
		mockSelectedElement.current = {
			selector: "a.cta",
			tagName: "a",
			isTextElement: true,
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

		expect(screen.getByTestId("style-panel-anchor-section")).toBeInTheDocument()
		expect(screen.getByDisplayValue("/docs")).toBeInTheDocument()
		expect(
			screen.queryByPlaceholderText("stylePanel.linkTitlePlaceholder"),
		).not.toBeInTheDocument()
	})

	it("should render and commit text content for a text node", async () => {
		mockSelectedElement.current = {
			selector: "p.copy",
			tagName: "p",
			isImageElement: false,
			isTextElement: true,
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
})
