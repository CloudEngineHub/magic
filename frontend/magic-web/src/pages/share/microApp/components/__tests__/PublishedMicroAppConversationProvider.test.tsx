import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { FileAccessProvider } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { createShareFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"
import PublishedMicroAppConversationProvider from "../PublishedMicroAppConversationProvider"

interface TestLayoutProps extends Record<string, unknown> {
	detailPanel: React.ReactNode
	isReadOnly: boolean
	renderMessagePanel: (props: Record<string, unknown>) => React.ReactNode
	historyLayout: {
		renderPanel: (props: Record<string, unknown>) => React.ReactNode
	}
}

const layoutMocks = vi.hoisted(() => ({
	props: null as TestLayoutProps | null,
	messagePanelProps: null as Record<string, unknown> | null,
}))

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel", () => ({
	default: (props: Record<string, unknown>) => {
		layoutMocks.messagePanelProps = props
		return (
			<div data-testid="app-conversation-panel">
				{props.trailingActions as React.ReactNode}
			</div>
		)
	},
}))

vi.mock("@/pages/superMagic/pages/TopicPage/components/TopicDesktopPanels", () => ({
	default: (props: TestLayoutProps) => {
		layoutMocks.props = props
		return (
			<div data-testid="topic-desktop-panels">
				{props.detailPanel as React.ReactNode}
				{props.isReadOnly
					? null
					: props.renderMessagePanel({
							isConversationPanelCollapsed: true,
							isDraggingPanel: false,
							onToggleConversationPanel: vi.fn(),
							onExpandConversationPanel: vi.fn(),
							historyTriggerMode: "layout",
							isHistoryPanelOpen: false,
							onToggleHistoryPanel: vi.fn(),
						})}
			</div>
		)
	},
}))

vi.mock("@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions", () => ({
	useScopedMessageHeaderTopicActions: () => ({}),
}))

vi.mock("@/pages/superMagic/components/MessageHeader", () => ({
	MessageHeaderTopicHistoryPanel: () => <div data-testid="message-header-topic-history-panel" />,
}))

vi.mock("../PublishedMicroAppAttachmentPopover", () => ({
	default: () => <button data-testid="published-micro-app-attachments-button" />,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppRuntimeProject: vi.fn(),
		ensureMicroAppRuntimeProject: vi.fn(),
		getProjectDetail: vi.fn(),
		getTopicsByProjectId: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/projectAttachmentsLoader", () => ({
	loadProjectAttachments: vi.fn().mockResolvedValue({ tree: [], list: [] }),
}))

describe("PublishedMicroAppConversationProvider", () => {
	beforeEach(() => {
		layoutMocks.props = null
		layoutMocks.messagePanelProps = null
		vi.mocked(loadProjectAttachments).mockClear()
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockReset()
		vi.mocked(SuperMagicApi.ensureMicroAppRuntimeProject).mockReset()
		vi.mocked(SuperMagicApi.getProjectDetail).mockReset()
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockReset()
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockResolvedValue({ exists: false })
	})

	it("renders children without AppStoreProvider when conversation is disabled", () => {
		render(
			<PublishedMicroAppConversationProvider appId="app-1" enabled={false}>
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)

		expect(screen.getByTestId("preview-child")).toBeInTheDocument()
		expect(screen.queryByTestId("topic-desktop-panels")).not.toBeInTheDocument()
	})

	it("renders children without a parent AppStoreProvider when enabled", async () => {
		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)

		expect(screen.getByTestId("preview-child")).toBeInTheDocument()
		expect(screen.getByTestId("topic-desktop-panels")).toBeInTheDocument()
		expect(layoutMocks.props?.isReadOnly).toBe(true)
		await waitFor(() => {
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledWith("app-1", {
				enableErrorMessagePrompt: false,
			})
		})
	})

	it("uses the shared desktop layout and history panel for a runtime project", async () => {
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockResolvedValue({
			exists: true,
			project: { id: "runtime-project-1" },
		} as never)
		vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue({
			id: "runtime-project-1",
		} as never)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)

		render(
			<FileAccessProvider
				value={createShareFileAccess({
					token: "origin-share-token",
					projectId: "origin-project",
				})}
			>
				<PublishedMicroAppConversationProvider appId="app-1">
					<div data-testid="preview-child" />
				</PublishedMicroAppConversationProvider>
			</FileAccessProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("app-conversation-panel")).toBeVisible()
			expect(screen.getByTestId("published-micro-app-attachments-button")).toBeVisible()
		})
		expect(screen.getByTestId("published-micro-app-conversation-panel")).toHaveClass(
			"border-l",
			"border-border",
			"bg-sidebar",
		)
		expect(loadProjectAttachments).toHaveBeenCalledWith({
			projectId: "runtime-project-1",
			enableErrorMessagePrompt: false,
		})

		expect(layoutMocks.props).toEqual(
			expect.objectContaining({
				showProjectSidebar: false,
				showProjectResizeHandle: false,
				initialConversationPanelCollapsed: true,
				persistConversationPanelState: false,
				conversationResizeHandleGripVariant: "dots",
				conversationResizeHandleClassName: "border-l border-border !bg-sidebar",
				keepConversationResizeHandleVisibleWhenCollapsed: true,
				historyOverlayScope: "container",
				shouldShowDetailPanel: true,
				isReadOnly: false,
				autoExpandConversationWhenDetailVisible: false,
			}),
		)
		expect(layoutMocks.messagePanelProps).toEqual(
			expect.objectContaining({
				historyTriggerMode: "layout",
				isConversationPanelCollapsed: true,
			}),
		)

		const collapseConversationPanel = vi.fn()
		const expandedPanel = layoutMocks.props?.renderMessagePanel({
			isConversationPanelCollapsed: false,
			isDraggingPanel: false,
			onToggleConversationPanel: collapseConversationPanel,
			onExpandConversationPanel: vi.fn(),
			historyTriggerMode: "layout",
			isHistoryPanelOpen: false,
			onToggleHistoryPanel: vi.fn(),
		})
		const expandedPanelRender = render(expandedPanel)
		expect(
			within(expandedPanelRender.container).getByTestId(
				"published-micro-app-conversation-header",
			),
		).toHaveTextContent("microAppPage.conversation.title")
		expect(
			within(expandedPanelRender.container).getByTestId(
				"published-micro-app-attachments-button",
			),
		).toBeVisible()
		expect(layoutMocks.messagePanelProps).toEqual(
			expect.objectContaining({
				hideConversationPanelToggle: true,
				isConversationPanelCollapsed: false,
				trailingActions: undefined,
			}),
		)
		fireEvent.click(
			expandedPanelRender.getByRole("button", {
				name: "microAppPage.conversation.collapse",
			}),
		)
		expect(collapseConversationPanel).toHaveBeenCalledTimes(1)
		expandedPanelRender.unmount()

		const historyPanel = layoutMocks.props?.historyLayout.renderPanel({
			mode: "fixed",
			onClose: vi.fn(),
			isConversationPanelCollapsed: false,
			onExpandConversationPanel: vi.fn(),
		})
		const { unmount } = render(historyPanel)
		expect(screen.getByTestId("message-header-topic-history-panel")).toBeInTheDocument()
		unmount()
	})

	it("does not render a stale runtime project after switching apps", async () => {
		const appA = createDeferred<{ exists: boolean; project?: { id: string } }>()
		const appB = createDeferred<{ exists: boolean; project?: { id: string } }>()
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockImplementation(
			(id) => (id === "app-1" ? appA.promise : appB.promise) as never,
		)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)

		const { rerender } = render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)
		await waitFor(() =>
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledWith(
				"app-1",
				expect.anything(),
			),
		)

		rerender(
			<PublishedMicroAppConversationProvider appId="app-2">
				<div data-testid="preview-child" />
			</PublishedMicroAppConversationProvider>,
		)
		appB.resolve({ exists: false })
		await waitFor(() =>
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledWith(
				"app-2",
				expect.anything(),
			),
		)

		appA.resolve({ exists: true, project: { id: "project-a" } })
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(SuperMagicApi.getProjectDetail).not.toHaveBeenCalled()
		expect(layoutMocks.props?.isReadOnly).toBe(true)
	})
})

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})

	return { promise, resolve }
}
