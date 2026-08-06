import { Children, forwardRef, useEffect, useImperativeHandle, type ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import MicroAppPageDesktop from "../index.desktop"
import { registerMicroAppDesktopWorkspaceCases } from "./index.desktop.workspace-cases"

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
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({
	default: () => vi.fn(),
}))

vi.mock("@/pages/superMagic/providers/file-action-visibility-provider", () => ({
	FileActionVisibilityProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		toolResponseMap: new Map(),
		getToolResponseForRendering: vi.fn(),
		getStreamState: vi.fn(),
		getMessageNode: vi.fn(),
	},
}))

vi.mock(
	"@/pages/superMagic/components/MessageList/components/Nodes/MessageNode/tool-call/ToolCallRenderer",
	() => ({
		ToolCallRenderer: ({ onClick }: { onClick: () => void }) => (
			<button type="button" data-testid="write-file" onClick={onClick}>
				file tool
			</button>
		),
	}),
)

vi.mock("@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo", () => ({
	getToolDesignProjectInfo: vi.fn(),
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

vi.mock("@/pages/superMagic/utils/handleFIle", () => ({
	getFileType: (fileExtension: string) => fileExtension,
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
		canPublish: true,
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

vi.mock("../components/AppConversationPanel", async () => {
	const { default: MicroAppConversationPanelMock } =
		await import("./MicroAppConversationPanelMock")
	return {
		default: (props: Record<string, unknown>) => {
			conversationPanelMocks.render(props)
			return <MicroAppConversationPanelMock {...props} />
		},
	}
})

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
	LongTremMemorySider: ({
		projectId,
		onFileClick,
	}: {
		projectId?: string
		onFileClick?: (file: AttachmentItem) => void
	}) => (
		<button
			type="button"
			data-testid="desktop-long-memory-panel"
			data-project-id={projectId}
			onClick={() =>
				onFileClick?.({
					file_id: "memory-1",
					file_name: "MEMORY.md",
					file_extension: "md",
					project_id: "0",
					display_config: { previewPolicy: { fileScope: "memory" } },
				})
			}
		>
			open memory file
		</button>
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

	registerMicroAppDesktopWorkspaceCases({
		renderPage: () => <MicroAppPageDesktop />,
		controllerMocks,
		resolverMocks,
		detailMocks,
		previewMocks,
		previewPopupMocks,
	})
})
