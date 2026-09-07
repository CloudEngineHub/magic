import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react"
import { forwardRef } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContextMorePopover } from "../ContextMorePopover"

const tabsContext = vi.hoisted(() => ({
	value: "",
	onValueChange: vi.fn<(value: string) => void>(),
}))

const moreStylesTabCache = vi.hoisted(() => {
	const tabs = new Map<string, string>()
	return {
		tabs,
		getMoreStylesTab: (selector: string) => tabs.get(selector),
		rememberMoreStylesTab: (selector: string, tab: string) => {
			tabs.set(selector, tab)
		},
		reset: () => tabs.clear(),
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../../../../iframe-bridge/contexts/StylePanelContext", () => ({
	useStylePanelStore: () => moreStylesTabCache,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: forwardRef<HTMLButtonElement, { children: ReactNode }>(function Button(
		{ children, ...props },
		ref,
	) {
		return (
			<button ref={ref} {...props}>
				{children}
			</button>
		)
	}),
}))

const popoverState = vi.hoisted(() => ({
	open: false,
	onOpenChange: undefined as ((open: boolean) => void) | undefined,
}))

vi.mock("@/components/shadcn-ui/popover", () => ({
	Popover: ({
		children,
		open,
		onOpenChange,
	}: {
		children: ReactNode
		open?: boolean
		onOpenChange?: (open: boolean) => void
	}) => {
		popoverState.open = Boolean(open)
		popoverState.onOpenChange = onOpenChange
		return <div>{children}</div>
	},
	PopoverTrigger: ({ children }: { children: ReactNode }) => (
		<span onClick={() => popoverState.onOpenChange?.(!popoverState.open)}>{children}</span>
	),
	PopoverContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/shadcn-ui/tabs", () => ({
	Tabs: ({
		value,
		onValueChange,
		children,
	}: {
		value: string
		onValueChange: (value: string) => void
		children: ReactNode
	}) => {
		tabsContext.value = value
		tabsContext.onValueChange = vi.fn(onValueChange)
		return <div>{children}</div>
	},
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({
		value,
		children,
		...props
	}: { value: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" onClick={() => tabsContext.onValueChange(value)} {...props}>
			{children}
		</button>
	),
	TabsContent: ({ value, children, ...props }: { value: string; children: ReactNode }) =>
		tabsContext.value === value ? <div {...props}>{children}</div> : null,
}))

vi.mock("../../../EditorFloating", () => ({
	EditorPopoverContent: ({
		children,
		side,
		style,
	}: {
		children: ReactNode
		side?: string
		style?: CSSProperties
	}) => (
		<div data-testid="style-panel-more-styles-content" data-side={side} style={style}>
			{children}
		</div>
	),
}))

vi.mock("../../sections/BackgroundSection", () => ({
	default: () => <div data-testid="background-section" />,
}))

vi.mock("../../sections/BorderSection", () => ({
	default: () => <div data-testid="border-section" />,
}))

vi.mock("../../sections/ShadowSection", () => ({
	default: () => <div data-testid="shadow-section" />,
}))

vi.mock("../../sections/BoxModelSection", () => ({
	default: () => <div data-testid="layout-section" />,
}))

vi.mock("../../sections/FlexGridSection", () => ({
	default: () => <div data-testid="flex-grid-section" />,
}))

vi.mock("../../sections/ImageSection", () => ({
	default: () => <div data-testid="image-section" />,
}))

vi.mock("../../sections/AnchorSection", () => ({
	AnchorSection: () => <div data-testid="anchor-section" />,
}))

vi.mock("../../sections/CustomCSSSection", () => ({
	CustomCSSSection: () => <div data-testid="custom-css-section" />,
}))

function createSelectedElement(selector: string) {
	return {
		selector,
		tagName: "img",
		isImageElement: true,
		computedStyles: {},
	} as never
}

const baseProps = {
	selectedElement: createSelectedElement("img.hero"),
	editorRef: { current: null } as never,
	disabled: false,
	showTypography: false,
	showFlexGrid: false,
	showImage: true,
	showBackground: true,
	showBorder: true,
	showShadow: true,
	isLink: false,
	fontFamilySelector: null,
	textContentField: null,
	onStyleChange: vi.fn(),
	onBatchStyleChange: vi.fn(),
	onUpdateAttributes: vi.fn().mockResolvedValue(undefined),
}

describe("ContextMorePopover", () => {
	afterEach(() => {
		moreStylesTabCache.reset()
		cleanup()
	})

	it("keeps background, border, and shadow independent and places layout second to last", () => {
		render(<ContextMorePopover {...baseProps} />)

		const tabLabels = screen.getAllByRole("button").map((button) => button.textContent)
		expect(tabLabels).toEqual([
			"stylePanel.moreStyles",
			"stylePanel.background",
			"stylePanel.border",
			"stylePanel.shadow",
			"stylePanel.imageSettings",
			"stylePanel.layout",
			"stylePanel.customCSS.title",
		])
		expect(tabLabels.at(-2)).toBe("stylePanel.layout")
		expect(screen.getByTestId("style-panel-more-background-tab")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-border-tab")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-shadow-tab")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-image-tab")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-layout-tab")).toBeInTheDocument()
		expect(screen.getByTestId("style-panel-more-advanced-tab")).toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "stylePanel.border" }))
		expect(screen.getByTestId("border-section")).toBeInTheDocument()
		expect(screen.queryByTestId("background-section")).not.toBeInTheDocument()
		expect(screen.queryByTestId("shadow-section")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "stylePanel.shadow" }))
		expect(screen.getByTestId("shadow-section")).toBeInTheDocument()
		expect(screen.queryByTestId("border-section")).not.toBeInTheDocument()
	})

	it("restores the last tab when the same element opens More Styles again", () => {
		const { unmount } = render(<ContextMorePopover {...baseProps} />)

		expect(screen.getByTestId("image-section")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "stylePanel.layout" }))
		expect(screen.getByTestId("layout-section")).toBeInTheDocument()

		unmount()
		render(<ContextMorePopover {...baseProps} />)

		expect(screen.getByTestId("layout-section")).toBeInTheDocument()
		expect(screen.queryByTestId("image-section")).not.toBeInTheDocument()
	})

	it("keeps More Styles tabs independent per element", () => {
		const { rerender } = render(<ContextMorePopover {...baseProps} />)

		fireEvent.click(screen.getByRole("button", { name: "stylePanel.layout" }))
		expect(screen.getByTestId("layout-section")).toBeInTheDocument()

		rerender(
			<ContextMorePopover
				{...baseProps}
				selectedElement={createSelectedElement("img.cover")}
			/>,
		)

		expect(screen.getByTestId("image-section")).toBeInTheDocument()
		expect(screen.queryByTestId("layout-section")).not.toBeInTheDocument()

		rerender(<ContextMorePopover {...baseProps} />)

		expect(screen.getByTestId("layout-section")).toBeInTheDocument()
	})

	it("falls back to the first tab after the edit session cache is cleared", () => {
		const { unmount } = render(<ContextMorePopover {...baseProps} />)

		fireEvent.click(screen.getByRole("button", { name: "stylePanel.layout" }))
		moreStylesTabCache.reset()
		unmount()
		render(<ContextMorePopover {...baseProps} />)

		expect(screen.getByTestId("image-section")).toBeInTheDocument()
		expect(screen.queryByTestId("layout-section")).not.toBeInTheDocument()
	})

	it("falls back to the first tab when the cached tab is no longer available", () => {
		moreStylesTabCache.rememberMoreStylesTab("img.hero", "image")

		render(<ContextMorePopover {...baseProps} showImage={false} />)

		expect(screen.getByTestId("background-section")).toBeInTheDocument()
		expect(screen.queryByTestId("image-section")).not.toBeInTheDocument()
	})

	it("opens the panel away from the selection beside the trigger", () => {
		const selectionRect = { left: 160, top: 420, width: 420, height: 240 }
		const getRect = HTMLElement.prototype.getBoundingClientRect
		HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
			if (this.getAttribute("data-testid") === "style-panel-more-styles-trigger") {
				return {
					x: 220,
					y: 360,
					width: 88,
					height: 32,
					top: 360,
					left: 220,
					bottom: 392,
					right: 308,
					toJSON() {
						return {}
					},
				}
			}
			return getRect.call(this)
		}

		try {
			render(<ContextMorePopover {...baseProps} selectionRect={selectionRect} />)
			fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))

			expect(screen.getByTestId("style-panel-more-styles-content").dataset.side).toBe("top")
		} finally {
			HTMLElement.prototype.getBoundingClientRect = getRect
		}
	})

	it("does not listen for scroll until More Styles is open", () => {
		const addEventListener = vi.spyOn(window, "addEventListener")
		render(
			<ContextMorePopover
				{...baseProps}
				selectionRect={{ left: 160, top: 420, width: 420, height: 240 }}
			/>,
		)

		expect(
			addEventListener.mock.calls.some(
				([type, , options]) => type === "scroll" && options === true,
			),
		).toBe(false)

		fireEvent.click(screen.getByTestId("style-panel-more-styles-trigger"))

		expect(
			addEventListener.mock.calls.some(
				([type, , options]) => type === "scroll" && options === true,
			),
		).toBe(true)

		addEventListener.mockRestore()
	})
})
