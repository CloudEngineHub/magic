import { useState } from "react"
import { userStore } from "@/models/user"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import MagicModal from "@/components/base/MagicModal"
import { authEventBus } from "@/services/auth/AuthEventBus"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { FileAccessProvider, useFileAccess } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { createShareFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"
import { useHostConversation } from "@/pages/superMagic/contexts/HostConversationContext"
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
	tasksProps: null as Record<string, unknown> | null,
	expand: () => {},
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: { confirm: vi.fn(() => ({ destroy: vi.fn() })) },
}))
vi.mock("@/services/auth/AuthEventBus", () => ({ authEventBus: { emit: vi.fn() } }))

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel", () => ({
	default: function MockAppConversationPanel(props: Record<string, unknown>) {
		layoutMocks.messagePanelProps = props
		return (
			<div
				data-testid="app-conversation-panel"
				data-file-access={JSON.stringify(useFileAccess())}
			>
				<input aria-label="draft" />
				{props.trailingActions as React.ReactNode}
			</div>
		)
	},
}))

vi.mock("@/pages/superMagic/pages/TopicPage/components/TopicDesktopPanels", () => ({
	default: function MockTopicDesktopPanels(props: TestLayoutProps) {
		const [collapsed, setCollapsed] = useState(true)
		layoutMocks.props = props
		layoutMocks.expand = () => setCollapsed(false)
		return (
			<div data-testid="topic-desktop-panels">
				{props.detailPanel as React.ReactNode}
				{props.isReadOnly
					? null
					: props.renderMessagePanel({
							isConversationPanelCollapsed: collapsed,
							isDraggingPanel: false,
							onToggleConversationPanel: () => setCollapsed((value) => !value),
							onExpandConversationPanel: () => setCollapsed(false),
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

vi.mock(
	"@/pages/superMagic/pages/MicroAppPage/components/MicroAppScheduledTasksPanel/MicroAppScheduledTasksPanel",
	() => ({
		default: function MockScheduledTasksPanel(props: Record<string, unknown>) {
			layoutMocks.tasksProps = props
			return (
				<div
					data-testid="runtime-tasks"
					data-file-access={JSON.stringify(useFileAccess())}
				/>
			)
		},
	}),
)

vi.mock("@/models/user", () => ({
	userStore: {
		user: { authorization: "test-token" },
	},
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
		vi.mocked(MagicModal.confirm).mockClear()
		vi.mocked(authEventBus.emit).mockClear()
		userStore.user.authorization = "test-token"
		layoutMocks.tasksProps = null
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
		expect(layoutMocks.props?.isReadOnly).toBe(false)
		await waitFor(() => {
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledWith("app-1", {
				enableErrorMessagePrompt: false,
			})
		})
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
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
			"bg-sidebar",
		)
		expect(screen.getByTestId("published-micro-app-conversation-panel")).not.toHaveClass(
			"border-l",
			"border-border",
		)
		expect(
			JSON.parse(
				screen.getByTestId("app-conversation-panel").getAttribute("data-file-access") ??
					"null",
			),
		).toEqual({ kind: "session", projectId: "runtime-project-1", topicId: "" })
		expect(loadProjectAttachments).toHaveBeenCalledWith({
			projectId: "runtime-project-1",
			enableErrorMessagePrompt: false,
		})

		expect(layoutMocks.props).toEqual(
			expect.objectContaining({
				showProjectSidebar: false,
				showProjectResizeHandle: false,
				initialConversationPanelCollapsed: true,
				collapsedConversationPanelWidth: 48,
				persistConversationPanelState: false,
				conversationResizeHandleGripVariant: "dots",
				detailResizeHandleClassName: "border-l border-border",
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
		const header = within(expandedPanelRender.container).getByTestId(
			"published-micro-app-conversation-header",
		)
		expect(
			within(header).getByRole("button", {
				name: "microAppPage.conversation.collapse",
			}),
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

	it("switches tasks, files and conversation in the same area and keeps the draft", async () => {
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockResolvedValue({
			exists: true,
			project: { id: "runtime-project" },
		} as never)
		vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue({
			id: "runtime-project",
			workspace_id: "runtime-workspace",
			project_name: "Runtime",
		} as never)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)
		render(
			<PublishedMicroAppConversationProvider appId="app-1" appName="My app">
				<div />
			</PublishedMicroAppConversationProvider>,
		)
		await waitFor(() =>
			expect(layoutMocks.messagePanelProps?.selectedProject).toMatchObject({
				id: "runtime-project",
			}),
		)
		fireEvent.change(screen.getByLabelText("draft"), { target: { value: "Unsent message" } })
		fireEvent.click(screen.getByTestId("published-micro-app-tasks-button"))
		expect(await screen.findByTestId("runtime-tasks")).toBeVisible()
		expect(layoutMocks.tasksProps).toMatchObject({
			selectProjectId: "runtime-project",
			selectWorkspaceId: "runtime-workspace",
			microAppId: "app-1",
			microAppName: "My app",
			compact: true,
		})
		expect(
			JSON.parse(
				screen.getByTestId("runtime-tasks").getAttribute("data-file-access") ?? "null",
			),
		).toMatchObject({ kind: "session", projectId: "runtime-project" })
		expect(screen.getByLabelText("draft")).not.toBeVisible()
		fireEvent.click(screen.getByTestId("published-micro-app-attachments-button"))
		expect(screen.getByTestId("published-micro-app-attachments-panel")).toBeVisible()
		expect(screen.queryByTestId("runtime-tasks")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("published-micro-app-conversation-button"))
		expect(screen.getByLabelText("draft")).toBeVisible()
		expect(screen.getByLabelText("draft")).toHaveValue("Unsent message")
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
	})

	it.each(["tasks", "attachments"])(
		"returns from collapsed %s to conversation through history",
		async (panel) => {
			vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockResolvedValue({
				exists: true,
				project: { id: "runtime-project" },
			} as never)
			vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue({
				id: "runtime-project",
				workspace_id: "workspace",
			} as never)
			vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)
			render(
				<PublishedMicroAppConversationProvider appId="app-1">
					<div />
				</PublishedMicroAppConversationProvider>,
			)
			await waitFor(() =>
				expect(layoutMocks.messagePanelProps?.selectedProject).toMatchObject({
					id: "runtime-project",
				}),
			)
			fireEvent.click(screen.getByTestId(`published-micro-app-${panel}-button`))
			expect(screen.getByLabelText("draft")).not.toBeVisible()
			fireEvent.click(
				screen.getByRole("button", { name: "microAppPage.conversation.collapse" }),
			)
			const historyPanel = layoutMocks.props?.historyLayout.renderPanel({
				isConversationPanelCollapsed: true,
				onExpandConversationPanel: layoutMocks.expand,
				onClose: vi.fn(),
			}) as React.ReactElement<{ onExpandConversationPanel: () => void }>
			act(() => {
				historyPanel.props.onExpandConversationPanel()
			})
			expect(screen.getByLabelText("draft")).toBeVisible()
		},
	)

	it("creates the runtime project from the tasks entry and allows retry after failure", async () => {
		vi.mocked(SuperMagicApi.ensureMicroAppRuntimeProject)
			.mockRejectedValueOnce(new Error("failed"))
			.mockResolvedValueOnce({ project: { id: "runtime-new" } } as never)
		vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue({
			id: "runtime-new",
			workspace_id: "runtime-workspace",
		} as never)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)
		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div />
			</PublishedMicroAppConversationProvider>,
		)
		await act(() => Promise.resolve())
		fireEvent.click(screen.getByTestId("published-micro-app-tasks-button"))
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"microAppPage.conversation.loadFailed",
		)
		expect(screen.queryByTestId("runtime-tasks")).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "common.retry" }))
		expect(await screen.findByTestId("runtime-tasks")).toBeVisible()
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).toHaveBeenCalledTimes(2)
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).toHaveBeenLastCalledWith("app-1")
		expect(layoutMocks.tasksProps?.selectProjectId).toBe("runtime-new")
	})

	it("keeps runtime controls hidden for unauthenticated visitors", async () => {
		userStore.user.authorization = ""
		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div />
			</PublishedMicroAppConversationProvider>,
		)
		await act(() => Promise.resolve())
		expect(screen.queryByTestId("published-micro-app-tasks-button")).not.toBeInTheDocument()
		expect(SuperMagicApi.getMicroAppRuntimeProject).not.toHaveBeenCalled()
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
	})

	it("returns the hydrated project from ensureConversation", async () => {
		const hydratedProject = {
			id: "runtime-project-1",
			project_status: "active",
			project_name: "Runtime",
		}
		vi.mocked(SuperMagicApi.ensureMicroAppRuntimeProject).mockResolvedValue({
			project: { id: hydratedProject.id },
			is_existing: false,
		} as never)
		vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue(hydratedProject as never)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)

		let ensured: { selectedProject: unknown } | null | undefined
		function EnsureButton() {
			const { ensureConversation } = useHostConversation()
			return (
				<button
					type="button"
					data-testid="ensure-conversation"
					onClick={async () => {
						ensured = await ensureConversation?.()
					}}
				/>
			)
		}

		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<EnsureButton />
			</PublishedMicroAppConversationProvider>,
		)
		await waitFor(() => {
			expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalled()
		})

		fireEvent.click(screen.getByTestId("ensure-conversation"))
		await waitFor(() => {
			expect(ensured?.selectedProject).toEqual(hydratedProject)
		})
		expect(ensured?.selectedProject).not.toEqual({ id: hydratedProject.id })
	})

	it.each(["onCancel", "onOk"] as const)(
		"does not create a runtime project when an anonymous action chooses %s",
		async (choice) => {
			userStore.user.authorization = ""
			const errors: string[] = []
			function StartButton() {
				const { ensureConversation } = useHostConversation()
				return (
					<button
						onClick={() =>
							void ensureConversation?.().catch((error: Error) => {
								errors.push(error.message)
							})
						}
					>
						Start
					</button>
				)
			}
			render(
				<PublishedMicroAppConversationProvider appId="app-1">
					<StartButton />
				</PublishedMicroAppConversationProvider>,
			)
			fireEvent.click(screen.getByText("Start"))
			fireEvent.click(screen.getByText("Start"))
			expect(MagicModal.confirm).toHaveBeenCalledTimes(1)
			expect(authEventBus.emit).not.toHaveBeenCalled()
			await act(async () => {
				vi.mocked(MagicModal.confirm).mock.calls[0][0][choice]?.()
			})
			expect(errors).toEqual(["Authentication required", "Authentication required"])
			expect(authEventBus.emit).toHaveBeenCalledTimes(choice === "onOk" ? 1 : 0)
			expect(SuperMagicApi.getMicroAppRuntimeProject).not.toHaveBeenCalled()
			expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
		},
	)

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
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0))
		})
		expect(SuperMagicApi.getProjectDetail).not.toHaveBeenCalled()
		expect(layoutMocks.messagePanelProps?.selectedProject).toBeNull()
		expect(layoutMocks.props?.isReadOnly).toBe(false)
	})

	it("reuses one creation request for concurrent actions", async () => {
		const creation = createDeferred<{ project: { id: string } }>()
		vi.mocked(SuperMagicApi.ensureMicroAppRuntimeProject).mockReturnValue(
			creation.promise as never,
		)
		vi.mocked(SuperMagicApi.getProjectDetail).mockResolvedValue({ id: "runtime-new" } as never)
		vi.mocked(SuperMagicApi.getTopicsByProjectId).mockResolvedValue({ list: [] } as never)
		const results: unknown[] = []
		function StartButton() {
			const { ensureConversation } = useHostConversation()
			return (
				<button
					onClick={() =>
						void ensureConversation?.().then((result) => results.push(result))
					}
				>
					Start
				</button>
			)
		}
		render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<StartButton />
			</PublishedMicroAppConversationProvider>,
		)
		await act(() => Promise.resolve())
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
		fireEvent.click(screen.getByText("Start"))
		fireEvent.click(screen.getByText("Start"))
		await waitFor(() =>
			expect(SuperMagicApi.ensureMicroAppRuntimeProject).toHaveBeenCalledTimes(1),
		)
		await act(async () => creation.resolve({ project: { id: "runtime-new" } }))
		await waitFor(() => expect(results).toHaveLength(2))
		expect(results[0]).toBe(results[1])
	})

	it("discards a pending project query after logout without querying anonymously", async () => {
		const query = createDeferred<{ exists: boolean; project: { id: string } }>()
		vi.mocked(SuperMagicApi.getMicroAppRuntimeProject).mockReturnValue(query.promise as never)
		const { rerender } = render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div />
			</PublishedMicroAppConversationProvider>,
		)
		userStore.user.authorization = ""
		rerender(
			<PublishedMicroAppConversationProvider appId="app-1">
				<div />
			</PublishedMicroAppConversationProvider>,
		)
		await act(async () => query.resolve({ exists: true, project: { id: "old-runtime" } }))
		expect(SuperMagicApi.getMicroAppRuntimeProject).toHaveBeenCalledTimes(1)
		expect(SuperMagicApi.getProjectDetail).not.toHaveBeenCalled()
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
	})

	it("does not start creation if the preview unmounts during authentication", async () => {
		let errorMessage = ""
		function StartButton() {
			const { ensureConversation } = useHostConversation()
			return (
				<button
					onClick={() =>
						void ensureConversation?.().catch((error: Error) => {
							errorMessage = error.message
						})
					}
				>
					Start
				</button>
			)
		}
		const { unmount } = render(
			<PublishedMicroAppConversationProvider appId="app-1">
				<StartButton />
			</PublishedMicroAppConversationProvider>,
		)
		await act(() => Promise.resolve())
		fireEvent.click(screen.getByText("Start"))
		unmount()
		await act(() => Promise.resolve())
		expect(errorMessage).toBe("Runtime project load superseded")
		expect(SuperMagicApi.ensureMicroAppRuntimeProject).not.toHaveBeenCalled()
	})
})

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})

	return { promise, resolve }
}
