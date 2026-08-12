import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, RefObject } from "react"
import { describe, expect, it, beforeEach, vi } from "vitest"
import TopicDesktopPanels from "../TopicDesktopPanels"

const mockUseTopicDesktopLayout = vi.fn()
const mockUseTopicDesktopPanelMotion = vi.fn()

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../../hooks/useTopicDesktopLayout", () => ({
	useTopicDesktopLayout: (options: unknown) => mockUseTopicDesktopLayout(options),
}))

vi.mock("../../hooks/useTopicDesktopPanelMotion", () => ({
	useTopicDesktopPanelMotion: (options: unknown) => mockUseTopicDesktopPanelMotion(options),
}))

vi.mock("../TopicResizeHandle", () => ({
	default: ({ className }: { className?: string }) => (
		<div className={className} data-testid="mock-topic-resize-handle" />
	),
}))

function createLayoutState(overrides?: Partial<ReturnType<typeof createLayoutState>>) {
	return {
		containerRef: { current: null } as RefObject<HTMLDivElement>,
		containerWidthPx: 1440,
		projectSiderWidthPx: 320,
		messagePanelWidthPx: 420,
		collapsedMessagePanelWidthPx: 24,
		isConversationPanelCollapsed: false,
		isDraggingProjectSider: false,
		isDraggingMessagePanel: false,
		startDragProjectSider: vi.fn(),
		startDragMessagePanel: vi.fn(),
		toggleConversationPanel: vi.fn(),
		expandConversationPanel: vi.fn(),
		collapseConversationPanel: vi.fn(),
		ensureExpandedWhenDetailVisible: vi.fn(),
		...overrides,
	}
}

function createMotionState(overrides?: Partial<ReturnType<typeof createMotionState>>) {
	return {
		panelResizeTransition: "none",
		messageTransform: "none",
		messageMotionTransition: "none",
		messagePanelTransition: "none",
		detailContentTransform: "none",
		detailContentTransition: "none",
		middleContainerWidth: 1112,
		canShowFixedTopicHistory: true,
		topicHistoryMode: "fixed" as const,
		topicHistoryPanelWidth: 256,
		targetMessagePanelWidth: 420,
		targetRightHandleWidth: 8,
		targetDetailPanelWidth: 684,
		...overrides,
	}
}

function renderTopicHistoryPanelContent({
	closeButtonRef,
	onClose,
	mode,
}: {
	closeButtonRef?: RefObject<HTMLButtonElement | null>
	onClose?: () => void
	mode?: "full-right" | "fixed" | "drawer"
}) {
	return (
		<div data-testid="topic-history-panel-content">
			<button
				ref={closeButtonRef}
				type="button"
				data-testid="topic-history-panel-close-button"
				onClick={onClose}
			>
				close-{mode}
			</button>
		</div>
	)
}

function renderComponent(overrides: Partial<ComponentProps<typeof TopicDesktopPanels>> = {}) {
	const defaultProps: ComponentProps<typeof TopicDesktopPanels> = {
		containerClassName: "topic-desktop-panels",
		detailPanelClassName: "detail-panel",
		isDetailPanelFullscreen: false,
		sidebar: <div data-testid="topic-sidebar">sidebar</div>,
		detailPanel: <div data-testid="topic-detail-content">detail</div>,
		isReadOnly: false,
		keepDetailMountedWhenHidden: true,
		historyLayout: {
			isOpen: true,
			onClose: vi.fn(),
			onToggle: vi.fn(),
			renderPanel: ({ closeButtonRef, onClose, mode }) =>
				renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
		},
		shouldShowDetailPanel: true,
		renderMessagePanel: () => (
			<div className="z-10" data-testid="topic-conversation-panel-root">
				conversation
			</div>
		),
	}

	return render(<TopicDesktopPanels {...defaultProps} {...overrides} />)
}

function getPortalPanelHost(panelTestId: string) {
	// The safe-area host is outside the layout tree because TopicDesktopPanels portals into body.
	return screen.getByTestId(panelTestId).parentElement?.parentElement?.parentElement
}

describe("TopicDesktopPanels", () => {
	let layoutState = createLayoutState()
	let motionState = createMotionState()

	beforeEach(() => {
		layoutState = createLayoutState()
		motionState = createMotionState()

		mockUseTopicDesktopLayout.mockImplementation(() => layoutState)
		mockUseTopicDesktopPanelMotion.mockImplementation(() => motionState)
	})

	it("隐藏项目侧栏时同时移除宽度占位和左侧拖拽手柄", () => {
		renderComponent({ showProjectSidebar: false })

		expect(screen.queryByTestId("topic-project-sidebar-slot")).not.toBeInTheDocument()
		expect(screen.queryByTestId("topic-sidebar")).not.toBeInTheDocument()
		expect(screen.getAllByTestId("mock-topic-resize-handle")).toHaveLength(1)
		expect(mockUseTopicDesktopLayout).toHaveBeenCalledWith(
			expect.objectContaining({ allowProjectSiderResize: false }),
		)
		expect(mockUseTopicDesktopPanelMotion).toHaveBeenCalledWith(
			expect.objectContaining({
				projectSiderWidthPx: 0,
				showProjectResizeHandle: false,
			}),
		)
	})

	it("switchable layout can disable automatic conversation expansion", () => {
		renderComponent({ autoExpandConversationWhenDetailVisible: false })

		const motionOptions = mockUseTopicDesktopPanelMotion.mock.calls[0][0]
		motionOptions.ensureExpandedWhenDetailVisible(true)

		expect(layoutState.ensureExpandedWhenDetailVisible).not.toHaveBeenCalled()
	})

	it("在无预览区且打开历史话题时渲染 full-right 固定面板", () => {
		motionState = createMotionState({
			topicHistoryMode: "full-right",
			targetMessagePanelWidth: 856,
			targetRightHandleWidth: 0,
			targetDetailPanelWidth: 0,
		})

		renderComponent({
			shouldShowDetailPanel: false,
		})

		expect(screen.getByTestId("topic-history-panel-fixed")).toBeInTheDocument()
		expect(screen.queryByTestId("topic-history-panel-drawer")).not.toBeInTheDocument()
		expect(screen.getAllByTestId("mock-topic-resize-handle")).toHaveLength(1)
	})

	it("固定历史话题 portal 遵守顶部、底部和右侧安全域", () => {
		motionState = createMotionState({
			topicHistoryMode: "full-right",
			targetMessagePanelWidth: 856,
			targetRightHandleWidth: 0,
			targetDetailPanelWidth: 0,
		})

		renderComponent({
			shouldShowDetailPanel: false,
		})

		const portalHost = getPortalPanelHost("topic-history-panel-fixed")
		expect(portalHost?.className).toContain("top-[var(--safe-area-inset-top)]")
		expect(portalHost?.className).toContain("right-[var(--safe-area-inset-right)]")
		expect(portalHost?.className).toContain("bottom-[var(--safe-area-inset-bottom)]")
	})

	it("抽屉历史话题面板遵守顶部、底部和右侧安全域", () => {
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})

		renderComponent()

		const drawerHost = screen.getByTestId("topic-history-panel-drawer").parentElement
			?.parentElement
		expect(drawerHost?.className).toContain("top-[var(--safe-area-inset-top)]")
		expect(drawerHost?.className).toContain("right-[var(--safe-area-inset-right)]")
		expect(drawerHost?.className).toContain("bottom-[var(--safe-area-inset-bottom)]")
		expect(screen.getByTestId("topic-history-panel-dismiss-area").className).toContain(
			"inset-0",
		)
	})

	it("在有预览区且阈值满足时渲染 fixed 固定面板", () => {
		motionState = createMotionState({
			topicHistoryMode: "fixed",
			canShowFixedTopicHistory: true,
			targetMessagePanelWidth: 360,
			targetRightHandleWidth: 8,
			targetDetailPanelWidth: 688,
		})

		renderComponent()

		expect(screen.getByTestId("topic-history-panel-fixed")).toBeInTheDocument()
		expect(screen.queryByTestId("topic-history-panel-drawer")).not.toBeInTheDocument()
		expect(screen.getAllByTestId("mock-topic-resize-handle")).toHaveLength(2)
	})

	it("在有预览区且阈值不满足时渲染 256px 抽屉和 backdrop", () => {
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})

		renderComponent()

		expect(screen.getByTestId("topic-history-panel-drawer")).toBeInTheDocument()
		expect(screen.getByTestId("topic-history-panel-dismiss-area")).toBeInTheDocument()
		expect(screen.getByTestId("topic-conversation-panel-root")).toHaveClass("z-10")
	})

	it("抽屉点击 backdrop 关闭", () => {
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})
		const handleCloseTopicHistoryPanel = vi.fn()

		renderComponent({
			historyLayout: {
				isOpen: true,
				onClose: handleCloseTopicHistoryPanel,
				onToggle: vi.fn(),
				renderPanel: ({ closeButtonRef, onClose, mode }) =>
					renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
			},
		})

		fireEvent.click(screen.getByTestId("topic-history-panel-dismiss-area"))

		expect(handleCloseTopicHistoryPanel).toHaveBeenCalledTimes(1)
	})

	it("抽屉按 Escape 关闭", () => {
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})
		const handleCloseTopicHistoryPanel = vi.fn()

		renderComponent({
			historyLayout: {
				isOpen: true,
				onClose: handleCloseTopicHistoryPanel,
				onToggle: vi.fn(),
				renderPanel: ({ closeButtonRef, onClose, mode }) =>
					renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
			},
		})
		fireEvent.keyDown(document, { key: "Escape" })

		expect(handleCloseTopicHistoryPanel).toHaveBeenCalledTimes(1)
	})

	it("首次测量前默认隐藏历史话题面板", () => {
		layoutState = createLayoutState({
			containerWidthPx: 0,
		})
		motionState = createMotionState({
			middleContainerWidth: 0,
			topicHistoryMode: "full-right",
		})

		renderComponent({
			shouldShowDetailPanel: false,
		})

		expect(screen.queryByTestId("topic-history-panel-fixed")).not.toBeInTheDocument()
		expect(screen.queryByTestId("topic-history-panel-drawer")).not.toBeInTheDocument()
		expect(screen.queryByTestId("topic-history-panel-backdrop")).not.toBeInTheDocument()
	})

	it("fixed 和 full-right 点击外部不关闭", () => {
		const handleCloseTopicHistoryPanel = vi.fn()

		const { rerender } = renderComponent({
			historyLayout: {
				isOpen: true,
				onClose: handleCloseTopicHistoryPanel,
				onToggle: vi.fn(),
				renderPanel: ({ closeButtonRef, onClose, mode }) =>
					renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
			},
		})
		fireEvent.mouseDown(document.body)

		motionState = createMotionState({
			topicHistoryMode: "full-right",
			targetRightHandleWidth: 0,
			targetDetailPanelWidth: 0,
		})
		rerender(
			<TopicDesktopPanels
				containerClassName="topic-desktop-panels"
				detailPanelClassName="detail-panel"
				isDetailPanelFullscreen={false}
				sidebar={<div data-testid="topic-sidebar">sidebar</div>}
				detailPanel={<div data-testid="topic-detail-content">detail</div>}
				isReadOnly={false}
				historyLayout={{
					isOpen: true,
					onClose: handleCloseTopicHistoryPanel,
					onToggle: vi.fn(),
					renderPanel: ({ closeButtonRef, onClose, mode }) =>
						renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
				}}
				shouldShowDetailPanel={false}
				renderMessagePanel={() => (
					<div className="z-10" data-testid="topic-conversation-panel-root">
						conversation
					</div>
				)}
			/>,
		)
		fireEvent.mouseDown(document.body)

		expect(handleCloseTopicHistoryPanel).not.toHaveBeenCalled()
	})

	it("详情区显隐变化时自动迁移 full-right、drawer、fixed", () => {
		const { rerender } = renderComponent({
			shouldShowDetailPanel: false,
		})

		expect(screen.getByTestId("topic-history-panel-fixed")).toBeInTheDocument()
		expect(screen.queryByTestId("topic-history-panel-drawer")).not.toBeInTheDocument()

		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})
		rerender(
			<TopicDesktopPanels
				containerClassName="topic-desktop-panels"
				detailPanelClassName="detail-panel"
				isDetailPanelFullscreen={false}
				sidebar={<div data-testid="topic-sidebar">sidebar</div>}
				detailPanel={<div data-testid="topic-detail-content">detail</div>}
				isReadOnly={false}
				historyLayout={{
					isOpen: true,
					onClose: vi.fn(),
					onToggle: vi.fn(),
					renderPanel: ({ closeButtonRef, onClose, mode }) =>
						renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
				}}
				shouldShowDetailPanel
				renderMessagePanel={() => (
					<div className="z-10" data-testid="topic-conversation-panel-root">
						conversation
					</div>
				)}
			/>,
		)

		expect(screen.getByTestId("topic-history-panel-drawer")).toBeInTheDocument()

		motionState = createMotionState({
			topicHistoryMode: "fixed",
			canShowFixedTopicHistory: true,
			targetMessagePanelWidth: 360,
			targetRightHandleWidth: 8,
			targetDetailPanelWidth: 688,
		})
		rerender(
			<TopicDesktopPanels
				containerClassName="topic-desktop-panels"
				detailPanelClassName="detail-panel"
				isDetailPanelFullscreen={false}
				sidebar={<div data-testid="topic-sidebar">sidebar</div>}
				detailPanel={<div data-testid="topic-detail-content">detail</div>}
				isReadOnly={false}
				historyLayout={{
					isOpen: true,
					onClose: vi.fn(),
					onToggle: vi.fn(),
					renderPanel: ({ closeButtonRef, onClose, mode }) =>
						renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
				}}
				shouldShowDetailPanel
				renderMessagePanel={() => (
					<div className="z-10" data-testid="topic-conversation-panel-root">
						conversation
					</div>
				)}
			/>,
		)

		expect(screen.queryByTestId("topic-history-panel-drawer")).not.toBeInTheDocument()
		expect(screen.getByTestId("topic-history-panel-fixed")).toBeInTheDocument()
	})

	it("有详情区时保持 detail -> handle -> conversation -> topic history 的顺序", () => {
		renderComponent()

		const mainContent = screen.getByTestId("topic-desktop-main-content")
		const orderedTestIds = Array.from(mainContent.children).map((element) =>
			element.getAttribute("data-testid"),
		)

		expect(orderedTestIds).toEqual([
			"topic-detail-panel-slot",
			"topic-detail-resize-handle-slot",
			"topic-conversation-panel-slot",
			null,
		])
	})

	it("无详情区时保持 detail -> conversation -> topic history 的顺序，且 detail 子树仍挂载", () => {
		motionState = createMotionState({
			topicHistoryMode: "full-right",
			targetMessagePanelWidth: 856,
			targetRightHandleWidth: 0,
			targetDetailPanelWidth: 0,
		})

		renderComponent({
			shouldShowDetailPanel: false,
		})

		expect(screen.getByTestId("topic-detail-panel-slot")).toBeInTheDocument()
		expect(screen.getByTestId("topic-detail-content")).toBeInTheDocument()
		const mainContent = screen.getByTestId("topic-desktop-main-content")
		const orderedTestIds = Array.from(mainContent.children).map((element) =>
			element.getAttribute("data-testid"),
		)

		expect(orderedTestIds).toEqual([
			"topic-detail-panel-slot",
			"topic-conversation-panel-slot",
			null,
		])
	})

	it("向 renderTopicHistoryPanel 传入 mode 和 onClose 契约参数", () => {
		const renderTopicHistoryPanel = vi.fn(({ mode, onClose }) => (
			<button
				type="button"
				data-testid={`topic-history-panel-contract-${mode}`}
				onClick={onClose}
			>
				contract
			</button>
		))
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})
		const handleCloseTopicHistoryPanel = vi.fn()

		renderComponent({
			historyLayout: {
				isOpen: true,
				onClose: handleCloseTopicHistoryPanel,
				onToggle: vi.fn(),
				renderPanel: renderTopicHistoryPanel,
			},
		})

		expect(renderTopicHistoryPanel).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "drawer",
				onClose: expect.any(Function),
				closeButtonRef: expect.any(Object),
			}),
		)

		fireEvent.click(screen.getByTestId("topic-history-panel-contract-drawer"))
		expect(handleCloseTopicHistoryPanel).toHaveBeenCalledTimes(1)
	})

	it("collapses the history panel before collapsing the conversation panel", () => {
		const handleCloseTopicHistoryPanel = vi.fn()
		const handleToggleConversationPanel = vi.fn()

		layoutState = createLayoutState({
			isConversationPanelCollapsed: false,
			toggleConversationPanel: handleToggleConversationPanel,
		})

		renderComponent({
			historyLayout: {
				isOpen: true,
				onClose: handleCloseTopicHistoryPanel,
				onToggle: vi.fn(),
				renderPanel: ({ closeButtonRef, onClose, mode }) =>
					renderTopicHistoryPanelContent({ closeButtonRef, onClose, mode }),
			},
			renderMessagePanel: ({ onToggleConversationPanel }) => (
				<button
					type="button"
					data-testid="topic-conversation-collapse-trigger"
					onClick={onToggleConversationPanel}
				>
					collapse
				</button>
			),
		})

		fireEvent.click(screen.getByTestId("topic-conversation-collapse-trigger"))

		expect(handleCloseTopicHistoryPanel).toHaveBeenCalledTimes(1)
		expect(handleToggleConversationPanel).toHaveBeenCalledTimes(1)
	})

	it("抽屉打开后关闭按钮获得焦点且键盘可达", async () => {
		motionState = createMotionState({
			topicHistoryMode: "drawer",
			canShowFixedTopicHistory: false,
		})

		renderComponent()

		const closeButton = screen.getByTestId("topic-history-panel-close-button")
		await waitFor(() => expect(closeButton).toHaveFocus())
		expect(closeButton).toHaveAttribute("type", "button")
		expect(closeButton).not.toHaveAttribute("tabindex", "-1")
	})
})
