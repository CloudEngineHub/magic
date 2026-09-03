import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ContextMorePopover } from "../ContextMorePopover"

const tabsContext = vi.hoisted(() => ({
	value: "",
	onValueChange: vi.fn<(value: string) => void>(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children, ...props }: { children: ReactNode }) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/components/shadcn-ui/popover", () => ({
	Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

vi.mock("../../EditorFloating", () => ({
	EditorPopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

const baseProps = {
	selectedElement: null,
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
})
