import { Children, forwardRef, useEffect, useImperativeHandle, type ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppPageDesktop from "../index.desktop"

const detailMocks = vi.hoisted(() => ({
	openFileTab: vi.fn(),
	render: vi.fn(),
}))

const previewMocks = vi.hoisted(() => ({
	aiEdit: vi.fn(),
	render: vi.fn(),
}))

vi.mock("react-router", () => ({
	useParams: () => ({ projectId: "project-1" }),
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
		isTopicHistoryPanelOpen: false,
		closeTopicHistoryPanel: vi.fn(),
		toggleTopicHistoryPanel: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageHeader", () => ({
	MessageHeaderTopicHistoryPanel: () => null,
}))

vi.mock("../context", () => ({
	AppStoreProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("../hooks/useMicroAppPageController", () => ({
	useMicroAppPageController: () => ({
		store: {
			initLoading: false,
			initError: null,
			mentionPanelStore: {},
			projectFilesStore: {},
		},
		conversation: {
			topicStore: {
				selectedTopic: { id: "topic-1", topic_name: "Topic" },
			},
		},
		selectedProject: { id: "project-1", project_name: "Micro App" },
		selectedTopic: { id: "topic-1", topic_name: "Topic" },
		isReadOnly: false,
		canRename: false,
		attachments: [],
		attachmentList: [
			{ file_id: "entry-1", file_name: "index.html", relative_file_path: "index.html" },
			{ file_id: "admin-1", file_name: "admin.html", relative_file_path: "admin.html" },
			{ file_id: "script-1", file_name: "app.js", relative_file_path: "app.js" },
		],
		activeFileId: "entry-1",
		userSelectDetail: null,
		setUserSelectDetail: vi.fn(),
		defaultEntryFile: { file_id: "entry-1", file_name: "index.html" },
		detailRef: { current: null },
		topicFilesProps: {},
		handleActiveFileChange: vi.fn(),
		handleBackToMicroApps: vi.fn(),
		handleOpenPublishDialog: vi.fn(),
		handleFileTabsCacheLoaded: vi.fn(),
		publishDialogOpen: false,
		setPublishDialogOpen: vi.fn(),
		renameDialogOpen: false,
		setRenameDialogOpen: vi.fn(),
		renameSubmitting: false,
		CollaboratorUpdatePanel: null,
		canManageCollaborators: false,
		handleManageCollaborators: vi.fn(),
		handleProjectNameChange: vi.fn(),
		handleRenameProject: vi.fn(),
	}),
}))

vi.mock("../components/MicroAppHeader", () => ({
	default: () => <header data-testid="desktop-micro-app-header" />,
}))

vi.mock("../components/MicroAppEntryPreview", () => ({
	default: function MockMicroAppEntryPreview(props: {
		entryFile?: { file_id?: string; file_name?: string } | null
		viewMode: "desktop" | "phone"
		refreshKey: number
		onRegisterAIEdit?: (handler: (() => void) | null) => void
		onOpenFile?: (fileItem?: unknown) => void
	}) {
		const { onRegisterAIEdit } = props
		useEffect(() => {
			onRegisterAIEdit?.(previewMocks.aiEdit)
			return () => onRegisterAIEdit?.(null)
		}, [onRegisterAIEdit])
		previewMocks.render(props)
		return <div data-testid="desktop-entry-preview" />
	},
}))

vi.mock("../components/AppConversationPanel", () => ({
	default: () => <div data-testid="desktop-conversation-panel" />,
}))

vi.mock("../components/MicroAppPageOverlays", () => ({
	default: () => null,
}))

vi.mock("../components/MicroAppDatabasePanel", () => ({
	default: ({ active }: { active: boolean }) => (
		<div data-testid="desktop-database-panel" data-active={String(active)} />
	),
}))

describe("MicroAppPageDesktop", () => {
	beforeEach(() => {
		localStorage.clear()
		detailMocks.openFileTab.mockClear()
		detailMocks.render.mockClear()
		previewMocks.aiEdit.mockClear()
		previewMocks.render.mockClear()
	})

	it("switches preview, file viewer, and database inside the main workspace", async () => {
		render(<MicroAppPageDesktop />)

		expect(screen.getByTestId("micro-app-nav-preview")).toHaveAttribute("aria-current", "page")
		expect(screen.queryByTestId("micro-app-file-sidebar")).not.toBeInTheDocument()
		expect(screen.getByTestId("desktop-entry-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("desktop-files-viewer")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-preview-address")).toHaveTextContent("/")
		expect(previewMocks.render).toHaveBeenLastCalledWith(
			expect.objectContaining({
				viewMode: "desktop",
				refreshKey: 0,
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
	})
})
