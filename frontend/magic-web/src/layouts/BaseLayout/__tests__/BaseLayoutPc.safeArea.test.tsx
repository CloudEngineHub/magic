import { fireEvent, render, screen } from "@testing-library/react"
import { forwardRef } from "react"
import { describe, expect, it, vi } from "vitest"
import BaseLayoutPc from "../BaseLayoutPc"

const { cancelSidebarAnimationMock, handleSidebarDraggingMock, handleSidebarResizeKeyDownMock } =
	vi.hoisted(() => ({
		cancelSidebarAnimationMock: vi.fn(),
		handleSidebarDraggingMock: vi.fn(),
		handleSidebarResizeKeyDownMock: vi.fn(() => true),
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

vi.mock("@/components/shadcn-ui/resizable", () => ({
	ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="mock-resizable-group">{children}</div>
	),
	ResizablePanel: forwardRef<HTMLDivElement, { children: React.ReactNode }>(function MockPanel(
		{ children },
		ref,
	) {
		return <div ref={ref}>{children}</div>
	}),
	ResizableHandle: ({
		onDragging,
		onKeyDownCapture,
	}: {
		onDragging?: (isDragging: boolean) => void
		onKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>
	}) => (
		<div
			data-testid="mock-resize-handle"
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
	it("renders the desktop shell with safe-area aware containers", () => {
		render(<BaseLayoutPc />)

		expect(screen.getByTestId("base-layout-pc-root")).toBeInTheDocument()
		expect(screen.getByTestId("base-layout-pc-root").getAttribute("style")).toContain(
			"--safe-area-inset-top",
		)
		expect(screen.getByTestId("base-layout-pc-main-frame").className).toContain("pr-2")

		const resizeHandle = screen.getByTestId("mock-resize-handle")
		fireEvent.pointerDown(resizeHandle)
		fireEvent.pointerUp(resizeHandle)
		fireEvent.keyDown(resizeHandle, { key: "ArrowRight" })

		expect(handleSidebarDraggingMock).toHaveBeenNthCalledWith(1, true)
		expect(handleSidebarDraggingMock).toHaveBeenNthCalledWith(2, false)
		expect(handleSidebarResizeKeyDownMock).toHaveBeenCalled()
		expect(cancelSidebarAnimationMock).toHaveBeenCalledTimes(2)
	})
})
