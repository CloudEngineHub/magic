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
		return (
			<div
				data-testid="style-panel-more-styles-portal"
				style={{ transform: "translateX(12px)" }}
			>
				{children}
			</div>
		)
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
		...props
	}: {
		children: ReactNode
		side?: string
		style?: CSSProperties
	} & Record<string, unknown>) => (
		<div
			data-testid="style-panel-more-styles-content"
			data-side={(props["data-side"] as string | undefined) ?? side}
			style={style}
		>
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

	it("opens the panel on the right of the trigger when space is available", () => {
		const selectionRect = { left: 120, top: 280, width: 200, height: 40 }
		const getRect = HTMLElement.prototype.getBoundingClientRect
		HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
			if (this.getAttribute("data-testid") === "style-panel-more-styles-trigger") {
				return {
					x: 240,
					y: 232,
					width: 88,
					height: 32,
					top: 232,
					left: 240,
					bottom: 264,
					right: 328,
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

			expect(screen.getByTestId("style-panel-more-styles-content").dataset.side).toBe("right")
		} finally {
			HTMLElement.prototype.getBoundingClientRect = getRect
		}
	})

	it("parks a lower-half selection's panel in the empty canvas above it", () => {
		const selectionRect = { left: 80, top: 400, width: 640, height: 280 }
		const getRect = HTMLElement.prototype.getBoundingClientRect
		HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
			if (this.getAttribute("data-testid") === "style-panel-more-styles-trigger") {
				return {
					x: 400,
					y: 360,
					width: 88,
					height: 32,
					top: 360,
					left: 400,
					bottom: 392,
					right: 488,
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
			const content = screen.getByTestId("style-panel-more-styles-content")
			expect(content.dataset.side).toBe("top")
			expect(content.style.position).toBe("fixed")
			expect(Number.parseFloat(content.style.maxHeight)).toBeGreaterThanOrEqual(160)
		} finally {
			HTMLElement.prototype.getBoundingClientRect = getRect
		}
	})

	it("keeps a huge selection's panel usable instead of a top sliver", () => {
		const selectionRect = { left: 80, top: 140, width: 720, height: 560 }
		const getRect = HTMLElement.prototype.getBoundingClientRect
		HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
			if (this.getAttribute("data-testid") === "style-panel-more-styles-trigger") {
				return {
					x: 520,
					y: 100,
					width: 88,
					height: 32,
					top: 100,
					left: 520,
					bottom: 132,
					right: 608,
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
			const content = screen.getByTestId("style-panel-more-styles-content")
			expect(content.dataset.side).not.toBe("top")
			expect(content.style.position).toBe("fixed")
			expect(Number.parseFloat(content.style.maxHeight)).toBeGreaterThanOrEqual(160)
		} finally {
			HTMLElement.prototype.getBoundingClientRect = getRect
		}
	})

	it("restores the popover parent transform after close and reopen", () => {
		const originalGetComputedStyle = window.getComputedStyle
		window.getComputedStyle = ((element: Element) => {
			const computed = originalGetComputedStyle(element)
			if ((element as HTMLElement).dataset.testid !== "style-panel-more-styles-portal") {
				return computed
			}
			const inline = (element as HTMLElement).style.getPropertyValue("transform")
			return new Proxy(computed, {
				get(style, prop) {
					if (prop === "transform") {
						return inline === "none" ? "none" : "matrix(1, 0, 0, 1, 12, 0)"
					}
					return Reflect.get(style, prop)
				},
			})
		}) as typeof window.getComputedStyle

		try {
			render(
				<ContextMorePopover
					{...baseProps}
					selectionRect={{ left: 80, top: 120, width: 240, height: 160 }}
				/>,
			)
			const parent = screen.getByTestId("style-panel-more-styles-portal")
			const trigger = screen.getByTestId("style-panel-more-styles-trigger")

			fireEvent.click(trigger)
			expect(parent.style.getPropertyValue("transform")).toBe("none")
			expect(parent.style.getPropertyPriority("transform")).toBe("important")

			fireEvent.click(trigger)
			expect(parent.style.getPropertyValue("transform")).toBe("translateX(12px)")
			expect(parent.style.getPropertyPriority("transform")).toBe("")

			fireEvent.click(trigger)
			expect(parent.style.getPropertyValue("transform")).toBe("none")
			fireEvent.click(trigger)
			expect(parent.style.getPropertyValue("transform")).toBe("translateX(12px)")
		} finally {
			window.getComputedStyle = originalGetComputedStyle
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
