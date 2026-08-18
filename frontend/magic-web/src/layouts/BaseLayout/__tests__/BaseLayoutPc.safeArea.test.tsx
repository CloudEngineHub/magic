import { fireEvent, render, screen } from "@testing-library/react"
import { forwardRef, useImperativeHandle } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import BaseLayoutPc from "../BaseLayoutPc"

const {
	cancelSidebarAnimationMock,
	handleSidebarDraggingMock,
	handleSidebarResizeKeyDownMock,
	sidebarResizeMock,
	widgetContextMock,
} = vi.hoisted(() => ({
	cancelSidebarAnimationMock: vi.fn(),
	handleSidebarDraggingMock: vi.fn(),
	handleSidebarResizeKeyDownMock: vi.fn(() => true),
	sidebarResizeMock: vi.fn(),
	widgetContextMock: {
		current: { embedContext: null, config: {} } as {
			embedContext: { instanceId: string; hostOrigin: string } | null
			config: { layout?: "desktop" | "mobile"; shell?: { appSidebar?: boolean } }
		},
	},
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
	Observer: ({ children }: { children: () => React.ReactNode }) => children(),
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <Args extends unknown[], ReturnValue>(fn: (...args: Args) => ReturnValue) => fn,
	useMount: (fn: () => void) => fn(),
}))

vi.mock("@/routes/hooks/useRoutesMetaSet", () => ({
	__esModule: true,
	default: () => undefined,
}))

vi.mock("@/hooks/router/useKeepAlive", () => ({
	useKeepAlive: () => ({
		Content: <div data-testid="mock-keep-alive-content" />,
	}),
}))

vi.mock("@/components/global/MultiFolderUploadToast", () => ({
	MultiFolderUploadToast: () => <div data-testid="mock-upload-toast" />,
}))

vi.mock("@/components/business/MemberCard", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-member-card" />,
}))

vi.mock("@/stores/display/MemberCardStore", () => ({
	__esModule: true,
	default: {
		domClassName: "member-card",
		getUidFromElement: vi.fn(),
		open: false,
		closeCard: vi.fn(),
		openCard: vi.fn(),
	},
}))

vi.mock("@/routes/history", () => ({
	history: {
		replace: vi.fn(),
	},
}))

vi.mock("@/utils/redirect", () => ({
	getHomeURL: () => Promise.resolve("/mock-home"),
}))

vi.mock("react-router-dom", () => ({
	useLocation: () => ({ search: "" }),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/providers/MagicWidgetProvider", () => ({
	useMagicWidgetConfig: () => widgetContextMock.current,
}))

vi.mock("@/providers/MagicWidgetProvider/config", () => ({
	resolveMagicWidgetCrewLayout: ({ configuredLayout }: { configuredLayout?: string }) =>
		configuredLayout ?? "desktop",
}))

vi.mock("@/components/shadcn-ui/resizable", () => ({
	ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="mock-resizable-group">{children}</div>
	),
	ResizablePanel: forwardRef<unknown, { children: React.ReactNode }>(function MockPanel(
		{ children },
		ref,
	) {
		useImperativeHandle(ref, () => ({ resize: sidebarResizeMock }))
		return <div>{children}</div>
	}),
	ResizableHandle: ({
		disabled,
		onDragging,
		onKeyDownCapture,
	}: {
		disabled?: boolean
		onDragging?: (isDragging: boolean) => void
		onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>
	}) => (
		<div
			data-testid="mock-resize-handle"
			data-disabled={String(Boolean(disabled))}
			onPointerDown={() => onDragging?.(true)}
			onPointerUp={() => onDragging?.(false)}
			onKeyDownCapture={onKeyDownCapture}
		/>
	),
}))

vi.mock("@/stores/layout", () => ({
	sidebarStore: {
		width: 20,
		collapsed: false,
		collapsedSizePercent: 8,
		MAX_WIDTH_PERCENT: 40,
	},
}))

vi.mock("../components/MagicSidebar", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-magic-sidebar" />,
}))

vi.mock("../hooks", () => ({
	useSidebarAnimation: () => cancelSidebarAnimationMock,
	useSidebarResponsive: () => ({
		getExpandedSidebarSizePercent: vi.fn(() => 20),
		handleSidebarDragging: handleSidebarDraggingMock,
		handleSidebarResize: vi.fn(),
		handleSidebarResizeKeyDown: handleSidebarResizeKeyDownMock,
		minSidebarSizePercent: 15,
	}),
}))

vi.mock("@/pages/superMagic/components/ShareManagement/stores", () => ({
	globalShareManagementStore: {
		visible: false,
	},
}))

vi.mock("@/enhance/magicElectron", () => ({
	magic: {
		env: {
			isElectron: () => false,
		},
	},
}))

vi.mock("../components/LayoutModalContainer", () => ({
	__esModule: true,
	default: () => <div data-testid="mock-layout-modal-container" />,
}))

describe("BaseLayoutPc safe area", () => {
	beforeEach(() => {
		cancelSidebarAnimationMock.mockClear()
		handleSidebarDraggingMock.mockClear()
		handleSidebarResizeKeyDownMock.mockClear()
		sidebarResizeMock.mockClear()
		widgetContextMock.current = { embedContext: null, config: {} }
	})

	it("renders the desktop shell with safe-area aware containers", () => {
		render(<BaseLayoutPc />)

		expect(screen.getByTestId("base-layout-pc-root")).toBeInTheDocument()
		expect(screen.getByTestId("base-layout-pc-root").getAttribute("style")).toContain(
			"--safe-area-inset-top",
		)
		expect(screen.getByTestId("base-layout-pc-main-frame").className).toContain("pr-2")
		expect(sidebarResizeMock).toHaveBeenCalledWith(20)
		cancelSidebarAnimationMock.mockClear()

		const resizeHandle = screen.getByTestId("mock-resize-handle")
		fireEvent.pointerDown(resizeHandle)
		fireEvent.pointerUp(resizeHandle)
		fireEvent.keyDown(resizeHandle, { key: "ArrowRight" })

		expect(handleSidebarDraggingMock).toHaveBeenNthCalledWith(1, true)
		expect(handleSidebarDraggingMock).toHaveBeenNthCalledWith(2, false)
		expect(handleSidebarResizeKeyDownMock).toHaveBeenCalled()
		expect(cancelSidebarAnimationMock).toHaveBeenCalledTimes(2)
	})

	it("hides the application sidebar only for a desktop Widget configuration", () => {
		widgetContextMock.current = {
			embedContext: {
				instanceId: "widget-mock-sidebar",
				hostOrigin: "https://widget-host.example.invalid",
			},
			config: { layout: "desktop", shell: { appSidebar: false } },
		}

		render(<BaseLayoutPc />)

		expect(sidebarResizeMock).toHaveBeenCalledWith(0)
		expect(screen.getByTestId("mock-magic-sidebar").parentElement).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		expect(screen.getByTestId("mock-resize-handle")).toHaveAttribute("data-disabled", "true")
		expect(screen.getByTestId("mock-keep-alive-content")).toBeInTheDocument()
		const mainFrameClassName = screen.getByTestId("base-layout-pc-main-frame").className
		expect(mainFrameClassName).not.toContain("py-2")
		expect(mainFrameClassName).not.toContain("pl-0")
		expect(mainFrameClassName).not.toContain("pr-2")
	})
})
