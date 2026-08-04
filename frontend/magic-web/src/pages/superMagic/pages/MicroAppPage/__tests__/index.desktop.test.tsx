import { Children, forwardRef, useEffect, useImperativeHandle, type ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import pubsub, { PubSubEvents } from "@/utils/pubsub"
import MicroAppPageDesktop from "../index.desktop"

const detailMocks = vi.hoisted(() => ({
	openFileTab: vi.fn(),
	render: vi.fn(),
}))

const previewMocks = vi.hoisted(() => ({
	aiEdit: vi.fn(),
	devConsoleToggle: vi.fn(),
	render: vi.fn(),
}))

const resolverMocks = vi.hoisted(() => ({
	result: {
		projectId: "project-1",
		isPublished: true,
		setIsPublished: vi.fn(),
		loading: false,
		error: null as Error | null,
	},
}))

const controllerMocks = vi.hoisted(() => ({
	initLoading: false,
	checkAttachmentsNowDebounced: vi.fn(),
	attachmentList: [
		{ file_id: "entry-1", file_name: "index.html", relative_file_path: "index.html" },
		{ file_id: "admin-1", file_name: "admin.html", relative_file_path: "admin.html" },
		{ file_id: "script-1", file_name: "app.js", relative_file_path: "app.js" },
	],
	defaultEntryFile: { file_id: "entry-1", file_name: "index.html" } as {
		file_id: string
		file_name: string
		relative_file_path?: string
		updated_at?: string
	} | null,
}))

const headerMocks = vi.hoisted(() => ({
	render: vi.fn(),
}))

const overlayMocks = vi.hoisted(() => ({
	render: vi.fn(),
}))

const conversationPanelMocks = vi.hoisted(() => ({
	render: vi.fn(),
}))

const topicHistoryMocks = vi.hoisted(() => ({
	isOpen: false,
	render: vi.fn(),
}))

const previewPopupMocks = vi.hoisted(() => ({
	open: vi.fn(),
}))

vi.mock("react-router", () => ({
	useParams: () => ({ appId: "app-1" }),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("@/pages/superMagic/providers/file-action-visibility-provider", () => ({
	FileActionVisibilityProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/components/shadcn-ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
		children,
	}: {
		value?: string
		onValueChange?: (value: string) => void
		disabled?: boolean
		children: ReactNode
	}) => (
		<select
			value={value || ""}
			disabled={disabled}
			data-testid="micro-app-preview-address"
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{Children.toArray(children)}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
}))

vi.mock("@/pages/superMagic/components/Detail", () => ({
	default: forwardRef((props, ref) => {
		useImperativeHandle(ref, () => ({ openFileTab: detailMocks.openFileTab }))
		detailMocks.render(props)
		return <div data-testid="desktop-files-viewer" />
	}),
}))

vi.mock("@/pages/superMagicMobile/components/PreviewDetailPopup", () => ({
	default: forwardRef((_props, ref) => {
		useImperativeHandle(ref, () => ({ open: previewPopupMocks.open }))
		return <div data-testid="desktop-detail-preview-popup" />
	}),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton", () => ({
	default: () => <div data-testid="desktop-file-list" />,
}))

vi.mock("@/pages/superMagic/hooks/useResizablePanel", () => ({
	default: ({ defaultWidth }: { defaultWidth: number }) => ({
		width: defaultWidth,
		isDragging: false,
		handleResizeStart: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle", () => ({
	default: () => <div data-testid="resize-handle" />,
}))

vi.mock("@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions", () => ({
	useScopedMessageHeaderTopicActions: () => ({}),
}))

vi.mock("@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState", () => ({
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS: { microApp: "micro-app" },
	useTopicHistoryLayoutState: () => ({
		isTopicHistoryPanelOpen: topicHistoryMocks.isOpen,
		closeTopicHistoryPanel: vi.fn(),
		toggleTopicHistoryPanel: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageHeader", () => ({
	MessageHeaderTopicHistoryPanel: (props: Record<string, unknown>) => {
		topicHistoryMocks.render(props)
		return null
	},
}))

vi.mock("../context", () => ({
	AppStoreProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("../hooks/useMicroAppPageController", () => ({
	useMicroAppPageController: () => ({
		store: {
			initLoading: controllerMocks.initLoading,
			initError: null,
			mentionPanelStore: {},
			projectFilesStore: {},
		},
		conversation: {
			topicStore: {
				selectedTopic: { id: "topic-1", topic_name: "Topic" },
			},
		},
		selectedProject: {
			id: "project-1",
			project_name: "Micro App",
			workspace_id: "workspace-1",
			workspace_name: "Workspace",
		},
		selectedTopic: { id: "topic-1", topic_name: "Topic" },
		hasRunningTopic: true,
		isReadOnly: false,
		canEdit: false,
		attachments: [],
		attachmentList: controllerMocks.attachmentList,
		activeFileId: "entry-1",
		userSelectDetail: null,
		setUserSelectDetail: vi.fn(),
		defaultEntryFile: controllerMocks.defaultEntryFile,
		detailRef: { current: null },
		topicFilesProps: {},
		handleActiveFileChange: vi.fn(),
		handleBackToMicroApps: vi.fn(),
		handleOpenPublishDialog: vi.fn(),
		handleFileTabsCacheLoaded: vi.fn(),
		checkAttachmentsNowDebounced: controllerMocks.checkAttachmentsNowDebounced,
		publishDialogOpen: false,
		setPublishDialogOpen: vi.fn(),
		editDialogOpen: false,
		setEditDialogOpen: vi.fn(),
		editSubmitting: false,
		CollaboratorUpdatePanel: null,
		canManageCollaborators: false,
		handleManageCollaborators: vi.fn(),
		handleProjectNameChange: vi.fn(),
		captureCoverReady: true,
		handleCaptureCover: vi.fn(),
		handleEditMicroApp: vi.fn(),
	}),
}))

vi.mock("../hooks/useMicroAppProjectResolver", () => ({
	useMicroAppProjectResolver: () => resolverMocks.result,
}))

vi.mock("../components/MicroAppHeader", () => ({
	default: (props: Record<string, unknown>) => {
		headerMocks.render(props)
		return <header data-testid="desktop-micro-app-header" />
	},
}))

vi.mock("../components/MicroAppEntryPreview", () => ({
	default: function MockMicroAppEntryPreview(props: {
		entryFile?: { file_id?: string; file_name?: string; updated_at?: string } | null
		viewMode: "desktop" | "phone"
		refreshKey: number
		onRegisterAIEdit?: (handler: (() => void) | null) => void
		onRegisterDevConsoleToggle?: (handler: (() => void) | null) => void
		onDevConsoleActiveChange?: (active: boolean) => void
		onOpenFile?: (fileItem?: unknown) => void
	}) {
		const { onRegisterAIEdit, onRegisterDevConsoleToggle } = props
		const hasEntryFile = Boolean(props.entryFile?.file_id)
		useEffect(() => {
			onRegisterAIEdit?.(previewMocks.aiEdit)
			return () => onRegisterAIEdit?.(null)
		}, [onRegisterAIEdit])
		useEffect(() => {
			onRegisterDevConsoleToggle?.(hasEntryFile ? previewMocks.devConsoleToggle : null)
			return () => onRegisterDevConsoleToggle?.(null)
		}, [hasEntryFile, onRegisterDevConsoleToggle])
		previewMocks.render(props)
		return <div data-testid="desktop-entry-preview" />
	},
}))

vi.mock("../components/AppConversationPanel", () => ({
	default: (props: Record<string, unknown>) => {
		conversationPanelMocks.render(props)
		return (
			<button
				type="button"
				data-testid="desktop-conversation-panel"
				onClick={() =>
					(props.onSelectDetail as ((detail: unknown) => void) | undefined)?.({
						type: "shell",
						currentFileId: "tool-1",
						data: { command: "pwd" },
					})
				}
			>
				conversation
			</button>
		)
	},
}))

vi.mock("../components/MicroAppPageOverlays", () => ({
	default: (props: Record<string, unknown>) => {
		overlayMocks.render(props)
		return null
	},
}))

vi.mock("../components/MicroAppDatabasePanel", () => ({
	default: ({ active }: { active: boolean }) => (
		<div data-testid="desktop-database-panel" data-active={String(active)} />
	),
}))

vi.mock("../components/MicroAppScheduledTasksPanel/MicroAppScheduledTasksPanel", () => ({
	default: ({
		selectWorkspaceId,
		selectProjectId,
		selectTopicId,
		workspaceName,
		projectName,
		className,
	}: {
		selectWorkspaceId?: string
		selectProjectId?: string
		selectTopicId?: string
		workspaceName?: string
		projectName?: string
		className?: string
	}) => (
		<div
			data-testid="desktop-scheduled-tasks-panel"
			data-workspace-id={selectWorkspaceId}
			data-project-id={selectProjectId}
			data-topic-id={selectTopicId}
			data-workspace-name={workspaceName}
			data-project-name={projectName}
			data-class-name={className}
		/>
	),
}))

vi.mock("@/pages/superMagic/components/ShareManagement/ShareManagementPanel", () => ({
	default: ({ projectId }: { projectId?: string }) => (
		<div data-testid="desktop-share-management-panel" data-project-id={projectId} />
	),
}))

vi.mock("@/pages/superMagic/components/LongTremMemory/components/MemorySider", () => ({
	LongTremMemorySider: ({ projectId }: { projectId?: string }) => (
		<div data-testid="desktop-long-memory-panel" data-project-id={projectId} />
	),
}))

describe("MicroAppPageDesktop", () => {
	beforeEach(() => {
		localStorage.clear()
		resolverMocks.result = {
			projectId: "project-1",
			isPublished: true,
			setIsPublished: vi.fn(),
			loading: false,
			error: null,
		}
		controllerMocks.initLoading = false
		controllerMocks.attachmentList = [
			{ file_id: "entry-1", file_name: "index.html", relative_file_path: "index.html" },
			{ file_id: "admin-1", file_name: "admin.html", relative_file_path: "admin.html" },
			{ file_id: "script-1", file_name: "app.js", relative_file_path: "app.js" },
		]
		controllerMocks.defaultEntryFile = { file_id: "entry-1", file_name: "index.html" }
		detailMocks.openFileTab.mockClear()
		detailMocks.render.mockClear()
		previewMocks.aiEdit.mockClear()
		previewMocks.devConsoleToggle.mockClear()
		previewMocks.render.mockClear()
		headerMocks.render.mockClear()
		overlayMocks.render.mockClear()
		conversationPanelMocks.render.mockClear()
		topicHistoryMocks.isOpen = false
		topicHistoryMocks.render.mockClear()
		previewPopupMocks.open.mockClear()
		controllerMocks.checkAttachmentsNowDebounced.mockClear()
	})

	it("shows a readable fallback when project resolution has no display message", () => {
		resolverMocks.result = {
			projectId: "",
			isPublished: false,
			setIsPublished: vi.fn(),
			loading: false,
			error: new Error(),
		}

		render(<MicroAppPageDesktop />)

		expect(screen.getByText("microAppPage.errors.loadFailed")).toBeInTheDocument()
		expect(screen.queryByText("[object ArrayBuffer]")).not.toBeInTheDocument()
	})

	it("uses the loading illustration while resolving the project", () => {
		resolverMocks.result = {
			projectId: "",
			isPublished: false,
			setIsPublished: vi.fn(),
			loading: true,
			error: null,
		}

		render(<MicroAppPageDesktop />)

		expect(screen.getByTestId("micro-app-resolver-loading-illustration")).toHaveAttribute(
			"data-state",
			"loading",
		)
	})

	it("passes the published state and updater through the desktop page", async () => {
		render(<MicroAppPageDesktop />)
		await screen.findByTestId("desktop-entry-preview")

		expect(headerMocks.render).toHaveBeenCalledWith(
			expect.objectContaining({ isPublished: true }),
		)
		expect(overlayMocks.render).toHaveBeenCalledWith(
			expect.objectContaining({
				onPublishStatusChange: resolverMocks.result.setIsPublished,
			}),
		)
	})

	it("opens tool details from the conversation panel in a preview modal", async () => {
		render(<MicroAppPageDesktop />)
		await screen.findByTestId("desktop-entry-preview")

		fireEvent.click(screen.getByTestId("desktop-conversation-panel"))

		expect(previewPopupMocks.open).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "shell",
				currentFileId: "tool-1",
			}),
			expect.any(Array),
			expect.any(Array),
		)
	})

	it("uses the same loading illustration while loading project context", () => {
		controllerMocks.initLoading = true

		render(<MicroAppPageDesktop />)

		expect(screen.getByTestId("micro-app-project-loading-illustration")).toHaveAttribute(
			"data-state",
			"loading",
		)
	})

	it("expands the conversation panel when entering from the micro-app home page", () => {
		localStorage.setItem("MAGIC:micro-app-page-message-panel-collapsed", "true")

		render(<MicroAppPageDesktop />)

		expect(screen.getByTestId("desktop-conversation-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-conversation-rail")).not.toBeInTheDocument()
	})

	it("connects task completion to the attachment refresh check", () => {
		render(<MicroAppPageDesktop />)

		expect(conversationPanelMocks.render).toHaveBeenCalledWith(
			expect.objectContaining({
				onTerminalTopicStatusChange: controllerMocks.checkAttachmentsNowDebounced,
			}),
		)
	})

	it("hides the topic mode icon in the micro-app history panel", () => {
		topicHistoryMocks.isOpen = true

		render(<MicroAppPageDesktop />)

		expect(topicHistoryMocks.render).toHaveBeenCalledWith(
			expect.objectContaining({ hideTopicListModeIcon: true }),
		)
	})

	it("shows the generated entry file after the attachment store refreshes", async () => {
		controllerMocks.attachmentList = []
		controllerMocks.defaultEntryFile = null
		const { rerender } = render(<MicroAppPageDesktop />)

		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({ entryFile: null }),
		)
		expect(screen.getByTestId("micro-app-preview-more")).toBeDisabled()

		const generatedEntry = {
			file_id: "generated-entry",
			file_name: "index.html",
			relative_file_path: "index.html",
		}
		controllerMocks.attachmentList = [generatedEntry]
		controllerMocks.defaultEntryFile = generatedEntry
		resolverMocks.result = { ...resolverMocks.result, isPublished: false }
		rerender(<MicroAppPageDesktop />)

		await waitFor(() => {
			expect(previewMocks.render).toHaveBeenLastCalledWith(
				expect.objectContaining({
					entryFile: expect.objectContaining({ file_id: "generated-entry" }),
				}),
			)
			expect(screen.getByTestId("micro-app-preview-more")).toBeEnabled()
		})
	})

	it("refreshes the current preview when the same entry file content changes", async () => {
		const initialEntry = {
			file_id: "entry-1",
			file_name: "index.html",
			relative_file_path: "index.html",
			updated_at: "2026-08-03T05:30:00Z",
		}
		controllerMocks.attachmentList = [initialEntry]
		controllerMocks.defaultEntryFile = initialEntry
		const { rerender } = render(<MicroAppPageDesktop />)

		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				entryFile: expect.objectContaining({
					file_id: "entry-1",
					updated_at: "2026-08-03T05:30:00Z",
				}),
			}),
		)

		const updatedEntry = {
			...initialEntry,
			updated_at: "2026-08-03T05:31:00Z",
		}
		controllerMocks.attachmentList = [updatedEntry]
		controllerMocks.defaultEntryFile = updatedEntry
		resolverMocks.result = { ...resolverMocks.result, isPublished: false }
		rerender(<MicroAppPageDesktop />)

		await waitFor(() => {
			expect(previewMocks.render).toHaveBeenLastCalledWith(
				expect.objectContaining({
					entryFile: expect.objectContaining({
						file_id: "entry-1",
						updated_at: "2026-08-03T05:31:00Z",
					}),
				}),
			)
		})
	})

	it("switches preview, file viewer, and database inside the main workspace", async () => {
		render(<MicroAppPageDesktop />)

		expect(screen.getByTestId("micro-app-nav-preview")).toHaveAttribute("aria-current", "page")
		expect(screen.getByTestId("desktop-conversation-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-conversation-rail")).not.toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-file-sidebar")).not.toBeInTheDocument()
		expect(screen.getByTestId("desktop-entry-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("desktop-files-viewer")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-preview-address")).toHaveTextContent("/")
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				viewMode: "desktop",
				refreshKey: 0,
				isBuilding: true,
			}),
		)
		expect(screen.getByTestId("micro-app-database-workspace")).toHaveAttribute(
			"aria-hidden",
			"true",
		)

		fireEvent.click(screen.getByTestId("micro-app-preview-phone"))
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({ viewMode: "phone" }),
		)

		fireEvent.click(screen.getByTestId("micro-app-preview-ai-edit"))
		expect(previewMocks.aiEdit).toHaveBeenCalledTimes(1)

		fireEvent.keyDown(screen.getByTestId("micro-app-preview-more"), { key: "Enter" })
		const debugToggle = await screen.findByTestId("micro-app-preview-debug-toggle")
		expect(debugToggle).toHaveTextContent("microAppPage.previewToolbar.enableDebug")
		fireEvent.click(debugToggle)
		expect(previewMocks.devConsoleToggle).toHaveBeenCalledTimes(1)

		act(() => {
			previewMocks.render.mock.lastCall?.[0].onDevConsoleActiveChange?.(true)
		})
		fireEvent.keyDown(screen.getByTestId("micro-app-preview-more"), { key: "Enter" })
		expect(await screen.findByTestId("micro-app-preview-debug-toggle")).toHaveTextContent(
			"microAppPage.previewToolbar.disableDebug",
		)

		act(() => {
			previewMocks.render.mock.lastCall?.[0].onOpenFile?.({
				file_id: "admin-1",
				file_name: "admin.html",
			})
		})
		expect(screen.getByTestId("micro-app-nav-preview")).toHaveAttribute("aria-current", "page")
		expect(screen.getByTestId("micro-app-preview-address")).toHaveTextContent("/admin.html")
		expect(screen.queryByTestId("desktop-files-viewer")).not.toBeInTheDocument()
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				entryFile: expect.objectContaining({ file_id: "admin-1" }),
			}),
		)

		fireEvent.change(screen.getByTestId("micro-app-preview-address"), {
			target: { value: "entry-1" },
		})
		expect(screen.getByTestId("micro-app-preview-address")).toHaveTextContent("/")
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				entryFile: expect.objectContaining({ file_id: "entry-1" }),
			}),
		)

		fireEvent.click(screen.getByTestId("micro-app-preview-refresh"))
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({ refreshKey: 1 }),
		)
		fireEvent.focus(screen.getByTestId("micro-app-preview-refresh"))
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"microAppPage.previewToolbar.refresh",
		)

		const previewWorkspace = screen.getByTestId("micro-app-preview-workspace")
		fireEvent.click(screen.getByTestId("micro-app-preview-fullscreen"))
		expect(previewWorkspace).toHaveAttribute("data-fullscreen", "true")
		expect(previewWorkspace).toHaveClass("fixed", "z-detail-fullscreen")
		expect(screen.getByTestId("micro-app-preview-fullscreen")).toHaveAttribute(
			"aria-label",
			"microAppPage.previewToolbar.exitFullscreen",
		)

		fireEvent.click(screen.getByTestId("micro-app-preview-fullscreen"))
		expect(previewWorkspace).toHaveAttribute("data-fullscreen", "false")
		expect(previewWorkspace).toHaveClass("absolute")

		fireEvent.click(screen.getByTestId("micro-app-preview-fullscreen"))
		fireEvent.keyDown(document, { key: "Escape" })
		expect(previewWorkspace).toHaveAttribute("data-fullscreen", "false")
		expect(previewWorkspace).toHaveClass("absolute")

		fireEvent.click(screen.getByTestId("micro-app-nav-files"))
		expect(screen.getByTestId("micro-app-file-sidebar")).toBeInTheDocument()
		expect(screen.getByTestId("desktop-file-list")).toBeInTheDocument()
		expect(screen.getByTestId("desktop-files-viewer")).toBeInTheDocument()
		expect(detailMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				showFileHeader: true,
				showFileFooter: false,
			}),
		)
		expect(detailMocks.render.mock.lastCall?.[0]).not.toHaveProperty("hideTabBar")
		expect(detailMocks.render.mock.lastCall?.[0]).not.toHaveProperty("nonClosableFileIds")

		fireEvent.click(screen.getByTestId("micro-app-nav-database"))
		expect(screen.getByTestId("micro-app-preview-workspace")).toHaveClass("hidden")
		expect(screen.getByTestId("micro-app-database-workspace")).toHaveAttribute(
			"aria-hidden",
			"false",
		)
		expect(await screen.findByTestId("desktop-database-panel")).toHaveAttribute(
			"data-active",
			"true",
		)
		expect(screen.queryByTestId("desktop-conversation-panel")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-conversation-rail")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-app-nav-preview"))
		expect(detailMocks.openFileTab).toHaveBeenCalledWith(
			expect.objectContaining({ file_id: "entry-1" }),
		)
		expect(screen.getByTestId("micro-app-preview-workspace")).toHaveAttribute(
			"aria-hidden",
			"false",
		)
		expect(screen.getByTestId("desktop-entry-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("desktop-files-viewer")).not.toBeInTheDocument()
		expect(screen.getByTestId("desktop-conversation-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-conversation-rail")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-app-nav-scheduled-tasks"))
		expect(screen.getByTestId("micro-app-nav-scheduled-tasks")).toHaveAttribute(
			"aria-current",
			"page",
		)
		expect(screen.getByTestId("micro-app-preview-workspace")).toHaveClass("hidden")
		expect(await screen.findByTestId("desktop-scheduled-tasks-panel")).toHaveAttribute(
			"data-workspace-id",
			"workspace-1",
		)
		expect(screen.getByTestId("desktop-scheduled-tasks-panel")).toHaveAttribute(
			"data-project-id",
			"project-1",
		)
		expect(screen.getByTestId("desktop-scheduled-tasks-panel")).toHaveAttribute(
			"data-topic-id",
			"topic-1",
		)
		expect(screen.getByTestId("desktop-scheduled-tasks-panel")).toHaveAttribute(
			"data-workspace-name",
			"Workspace",
		)
		expect(screen.getByTestId("desktop-scheduled-tasks-panel")).toHaveAttribute(
			"data-project-name",
			"Micro App",
		)
		const projectPanelClassName = screen
			.getByTestId("desktop-scheduled-tasks-panel")
			.getAttribute("data-class-name")
		expect(projectPanelClassName).toContain("share-management-content")
		expect(projectPanelClassName).not.toContain("project-panel-content]>div]:gap-0")

		fireEvent.click(screen.getByTestId("micro-app-nav-share-management"))
		expect(await screen.findByTestId("desktop-share-management-panel")).toHaveAttribute(
			"data-project-id",
			"project-1",
		)

		fireEvent.click(screen.getByTestId("micro-app-nav-long-memory"))
		expect(await screen.findByTestId("desktop-long-memory-panel")).toHaveAttribute(
			"data-project-id",
			"project-1",
		)
		expect(screen.getByTestId("micro-app-project-panel-workspace")).toBeInTheDocument()
	})

	it("opens a message file reference in the files workspace", async () => {
		const file = {
			file_id: "admin-1",
			file_name: "admin.html",
			relative_file_path: "admin.html",
		}

		render(<MicroAppPageDesktop />)

		act(() => {
			pubsub.publish(PubSubEvents.Open_File_Tab, {
				fileId: file.file_id,
				fileData: file,
			})
		})

		expect(screen.getByTestId("micro-app-nav-files")).toHaveAttribute("aria-current", "page")
		expect(screen.getByTestId("desktop-files-viewer")).toBeInTheDocument()
		await waitFor(() => {
			expect(detailMocks.openFileTab).toHaveBeenCalledWith(file)
		})
	})
})
