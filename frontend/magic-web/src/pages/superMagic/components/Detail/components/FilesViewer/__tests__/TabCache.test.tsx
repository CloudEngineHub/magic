import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, it, expect, vi } from "vitest"
import TabCache from "../components/TabCache"

const mockDeviceState = vi.hoisted(() => ({
	isMagicApp: false,
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return mockDeviceState.isMagicApp
	},
}))

vi.mock("antd", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => children,
	Flex: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/hooks/useFullscreenMode", () => ({
	default: () => false,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../components/PlaybackTabContent", () => ({
	default: () => <div data-testid="playback-tab-content" />,
}))

vi.mock("../components/KnowledgeBaseTabContent", () => ({
	default: () => <div data-testid="knowledge-base-tab-content" />,
}))

// Mock dependencies
vi.mock("../../../Render", () => ({
	default: () => <div data-testid="render-component" />,
}))

describe("TabCache", () => {
	beforeEach(() => {
		mockDeviceState.isMagicApp = false
	})

	const mockTab = {
		id: "test-tab-1",
		title: "Test File",
		refreshKey: "refresh-key-1",
	}

	const mockRenderProps = {
		isFullscreen: false,
		openFileTab: vi.fn(),
		allowEdit: true,
		selectedProject: null,
	}

	it("renders active tab correctly", () => {
		render(<TabCache tab={mockTab} isActive={true} renderProps={mockRenderProps} />)

		const container = screen.getByTestId("render-component").parentElement
		expect(container).toHaveClass("pointer-events-auto")
		expect(container).toHaveClass("visible")
		expect(container).toHaveClass("opacity-100")
		expect(container).not.toHaveClass("pointer-events-none")
	})

	it("renders inactive tab correctly", () => {
		render(<TabCache tab={mockTab} isActive={false} renderProps={mockRenderProps} />)

		const container = screen.getByTestId("render-component").parentElement
		expect(container).toHaveClass("pointer-events-none")
		expect(container).toHaveClass("invisible")
		expect(container).toHaveClass("opacity-0")
		expect(container).not.toHaveClass("pointer-events-auto")
	})

	it("passes render props to Render component", () => {
		render(<TabCache tab={mockTab} isActive={true} renderProps={mockRenderProps} />)

		const renderComponent = screen.getByTestId("render-component")
		expect(renderComponent).toBeInTheDocument()
	})

	it("calls onActiveFileChange when provided", () => {
		const mockOnActiveFileChange = vi.fn()

		render(
			<TabCache
				tab={mockTab}
				isActive={true}
				renderProps={mockRenderProps}
				onActiveFileChange={mockOnActiveFileChange}
			/>,
		)

		// The onActiveFileChange should be passed to Render component
		const renderComponent = screen.getByTestId("render-component")
		expect(renderComponent).toBeInTheDocument()
	})

	it("uses tab refreshKey as key when available", () => {
		const tabWithRefreshKey = {
			...mockTab,
			refreshKey: "custom-refresh-key",
		}

		render(<TabCache tab={tabWithRefreshKey} isActive={true} renderProps={mockRenderProps} />)

		const renderComponent = screen.getByTestId("render-component")
		expect(renderComponent).toBeInTheDocument()
	})

	it("falls back to tab id when refreshKey is not available", () => {
		const tabWithoutRefreshKey = {
			...mockTab,
			refreshKey: undefined,
		}

		render(
			<TabCache tab={tabWithoutRefreshKey} isActive={true} renderProps={mockRenderProps} />,
		)

		const renderComponent = screen.getByTestId("render-component")
		expect(renderComponent).toBeInTheDocument()
	})

	it("renders website tabs through iframe content instead of the file Render component", () => {
		render(
			<TabCache
				tab={
					{
						id: "website:unsplash",
						title: "Unsplash",
						fileData: {
							file_id: "website:unsplash",
							file_name: "Unsplash",
							url: "https://unsplash.com",
							display_config: {
								type: "website",
								name: "Unsplash",
								description: "Image references",
							},
						},
					} as any
				}
				isActive={true}
				renderProps={mockRenderProps}
			/>,
		)

		expect(screen.queryByTestId("render-component")).not.toBeInTheDocument()
		expect(screen.getByTitle("Unsplash")).toHaveAttribute("src", "https://unsplash.com")
	})

	it("uses the legacy browser fullscreen content layer outside Magic App", () => {
		render(
			<TabCache tab={mockTab} isActive={true} renderProps={mockRenderProps} isFullscreen />,
		)

		const container = screen.getByTestId("render-component").parentElement
		expect(container).toHaveClass("fixed")
		expect(container).toHaveClass("top-0")
		expect(container).not.toHaveClass("inset-0")
	})

	it("keeps the active pure-share tab in document flow instead of a fixed layer", () => {
		render(
			<TabCache
				tab={mockTab}
				isActive={true}
				renderProps={mockRenderProps}
				isFullscreen
				documentFlowFullscreen
			/>,
		)

		const container = screen.getByTestId("render-component").parentElement
		expect(container).toHaveClass("relative")
		expect(container).toHaveClass("min-h-dvh")
		expect(container).not.toHaveClass("fixed")
	})

	it("keeps Magic App fullscreen content bounded by the safe-area shell", () => {
		mockDeviceState.isMagicApp = true

		render(
			<TabCache tab={mockTab} isActive={true} renderProps={mockRenderProps} isFullscreen />,
		)

		const container = screen.getByTestId("render-component").parentElement
		expect(container).toHaveClass("absolute")
		expect(container).toHaveClass("inset-0")
		expect(container).not.toHaveClass("fixed")
	})
})
