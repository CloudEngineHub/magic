import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { ShareMode } from "@/pages/superMagic/components/Share/types"
import DefaultOpenFilePicker from "../components/DefaultOpenFilePicker"
import ProjectShareSheet from "../index"
import type { ProjectShareSheetView } from "../types"

const { mockViewRef } = vi.hoisted(() => ({
	mockViewRef: { current: "manage" as ProjectShareSheetView },
}))

const { mockControllerHandlers } = vi.hoisted(() => ({
	mockControllerHandlers: {
		closeDefaultOpenFilePicker: vi.fn(),
		selectDefaultOpenFile: vi.fn(),
	},
}))

vi.hoisted(() => {
	const storageMock = {
		getItem: () => null,
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(),
		length: 0,
	}

	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

interface MockCommonPopupProps {
	children: ReactNode
	popupProps?: {
		visible?: boolean
		className?: string
		bodyClassName?: string
		bodyStyle?: {
			background?: string
			height?: string
		}
	}
}

vi.mock("@/pages/superMagicMobile/components/CommonPopup", () => ({
	default: ({ children, popupProps }: MockCommonPopupProps) =>
		popupProps?.visible ? (
			<div
				data-testid="mock-common-popup"
				data-popup-classname={popupProps.className}
				data-popup-body-classname={popupProps.bodyClassName}
				data-popup-background={popupProps.bodyStyle?.background}
				data-popup-height={popupProps.bodyStyle?.height}
			>
				<div
					className="h-1 w-20 rounded-full"
					data-testid="mock-common-popup-default-handle"
				/>
				{children}
			</div>
		) : null,
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({
		children,
		className,
		scrollClassName,
		fadeColor,
	}: {
		children: ReactNode
		className?: string
		scrollClassName?: string
		fadeColor: string
	}) => (
		<div
			className={className}
			data-testid="mock-scroll-edge-fade-container"
			data-fade-color={fadeColor}
		>
			<div
				className={`min-h-0 flex-1 overflow-y-auto ${scrollClassName ?? ""}`.trim()}
				data-testid="mock-scroll-edge-fade-scroll-port"
			>
				{children}
			</div>
		</div>
	),
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon",
	() => ({
		MobileAttachmentRowIcon: ({
			item,
			dataTestId,
		}: {
			item: { name?: string; file_name?: string }
			dataTestId?: string
		}) => (
			<span
				data-testid={dataTestId || "mock-mobile-attachment-row-icon"}
				data-item-name={item.name || item.file_name}
			/>
		),
	}),
)

vi.mock("@/pages/superMagic/components/Share/Modal", () => ({
	default: () => <div data-testid="project-share-edit-modal" />,
}))

vi.mock("../components/ProjectShareSheetHeader", () => ({
	default: () => <div data-testid="project-share-sheet-header" />,
}))

vi.mock("../components/ProjectShareCreateView", () => ({
	default: () => <div data-testid="project-share-sheet-create-view" />,
}))

vi.mock("../components/ProjectShareLinkDetailView", () => ({
	default: () => <div data-testid="project-share-sheet-detail-view" />,
}))

vi.mock("../components/ProjectShareExpiryView", () => ({
	default: () => <div data-testid="project-share-sheet-expiry-view" />,
}))

vi.mock("../components/ProjectShareDeleteConfirmView", () => ({
	default: () => <div data-testid="project-share-sheet-delete-confirm-view" />,
}))

vi.mock("../hooks/useProjectShareSheet", () => ({
	useProjectShareSheet: () => ({
		open: true,
		mode: "project",
		projectMode: "",
		shareMode: ShareMode.Project,
		view: mockViewRef.current,
		viewStack: ["create"],
		projectName: "Demo Project",
		projectId: "project-1",
		formState: {
			shareName: "Demo Project",
			shareType: 5,
			shareExpiry: null,
			password: "abc123",
			shareRange: "all",
			shareTargets: [],
			advancedSettings: {},
		},
		filteredShareItems: [],
		selectedShare: null,
		loading: false,
		saving: false,
		isCheckingShare: false,
		advancedOpen: false,
		defaultSelectedFileIds: ["file-1"],
		selectedFileIds: ["file-1"],
		groupedShareItems: [],
		enableInlineFileSelection: false,
		selectedFileItems: [],
		selectedFileHierarchy: [],
		selectedFileCount: 0,
		defaultOpenFileId: "file-1",
		defaultOpenFileItem: {
			file_id: "file-1",
			name: "fictional-default.html",
			file_extension: "html",
			is_directory: false,
		},
		defaultOpenFileCandidates: [
			{
				file_id: "file-1",
				name: "fictional-default.html",
				file_extension: "html",
				is_directory: false,
			},
			{
				file_id: "file-2",
				name: "fictional-report.md",
				file_extension: "md",
				is_directory: false,
			},
		],
		defaultOpenFileCandidateTree: [
			{
				file_id: "file-1",
				name: "fictional-default.html",
				file_extension: "html",
				is_directory: false,
			},
			{
				file_id: "file-2",
				name: "fictional-report.md",
				file_extension: "md",
				is_directory: false,
			},
		],
		defaultOpenFilePickerOpen: mockViewRef.current === "create",
		memberSelectorOpen: false,
		selectedMemberNodes: [],
		detailMemberNodes: [],
		detailMemberLoading: false,
		selectedShareMessageText: "",
		canNativeShare: false,
		shareSelectedShareToSystem: vi.fn(),
		setShareName: vi.fn(),
		setShareType: vi.fn(),
		setShareExpiry: vi.fn(),
		setPassword: vi.fn(),
		resetPassword: vi.fn(),
		setShareRange: vi.fn(),
		setShareTargets: vi.fn(),
		setAdvancedSettings: vi.fn(),
		setAdvancedOpen: vi.fn(),
		setSelectedFileIds: vi.fn(),
		toggleShareFileId: vi.fn(),
		openMemberSelector: vi.fn(),
		closeMemberSelector: vi.fn(),
		setSelectedMemberNodes: vi.fn(),
		confirmMemberSelector: vi.fn(),
		goToManage: vi.fn(),
		goToExpiry: vi.fn(),
		goToDeleteConfirm: vi.fn(),
		goToLinkDetail: vi.fn(),
		goBack: vi.fn(),
		close: vi.fn(),
		refreshShareList: vi.fn(),
		copySelectedShareUrl: vi.fn(),
		copySelectedSharePassword: vi.fn(),
		openDefaultOpenFilePicker: vi.fn(),
		closeDefaultOpenFilePicker: mockControllerHandlers.closeDefaultOpenFilePicker,
		selectDefaultOpenFile: mockControllerHandlers.selectDefaultOpenFile,
		submitCreateShare: vi.fn(),
		openEditSelectedShare: vi.fn(),
		confirmCancelShare: vi.fn(),
		editResourceId: undefined,
		closeEditModal: vi.fn(),
	}),
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => {
				const labels: Record<string, string> = {
					"projectShare.empty": "暂无分享链接",
					"mobile.emptyState.variants.shareLink.title": "还没有分享链接",
					"mobile.emptyState.variants.shareLink.description":
						"返回上一页创建第一个分享链接。",
					"mobile.emptyState.variants.files.title": "暂无文件",
					"mobile.emptyState.variants.files.description":
						"上传或新建文件后将显示在这里。",
					"mobile.emptyState.variants.chatFilesSearch.title": "没有匹配的文件",
					"mobile.emptyState.variants.chatFilesSearch.description": "换个关键词试试。",
					"projectShare.manageTitle": "分享管理",
					"common.close": "关闭",
				}
				return labels[key] || key
			},
		}),
	}
})

function renderProjectShareSheet() {
	return render(
		<ProjectShareSheet
			open
			projectName="Demo Project"
			projectId="project-1"
			attachments={[]}
			onClose={vi.fn()}
		/>,
	)
}

describe("ProjectShareSheet", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("applies scroll safe-bottom padding on views without a fixed footer", () => {
		mockViewRef.current = "manage"
		renderProjectShareSheet()

		expect(screen.getByTestId("project-share-sheet-scroll").className).toContain(
			"safe-area-inset-bottom",
		)
	})

	it("does not add scroll safe-bottom padding when the fixed footer owns bottom inset", () => {
		mockViewRef.current = "create"
		renderProjectShareSheet()

		expect(screen.getByTestId("project-share-sheet-scroll").className).not.toContain(
			"safe-area-inset-bottom",
		)
	})

	it("管理页为空时展示空态", () => {
		mockViewRef.current = "manage"
		renderProjectShareSheet()

		expect(screen.getByTestId("project-share-sheet-root")).toBeInTheDocument()
		expect(screen.getByTestId("mock-common-popup")).toHaveAttribute(
			"data-popup-classname",
			expect.stringContaining("bg-[#F7F7F6]"),
		)
		expect(screen.getByTestId("mock-common-popup")).toHaveAttribute(
			"data-popup-background",
			"#F7F7F6",
		)
		expect(screen.getByTestId("project-share-sheet-manage-empty")).toHaveTextContent(
			"还没有分享链接",
		)
	})

	it("默认文件选择器打开时展示候选并支持选择其他文件", () => {
		mockViewRef.current = "create"
		renderProjectShareSheet()

		expect(screen.getByTestId("project-share-default-file-picker")).toBeInTheDocument()
		expect(screen.getByText("fictional-default.html")).toBeInTheDocument()
		expect(screen.getByText("fictional-report.md")).toBeInTheDocument()

		fireEvent.click(screen.getByText("fictional-report.md"))

		expect(mockControllerHandlers.selectDefaultOpenFile).toHaveBeenCalledWith("file-2")
	})

	it("默认文件选择器只保留基础弹窗手柄", () => {
		const { container } = render(
			<DefaultOpenFilePicker
				open
				candidateTree={[
					{
						file_id: "file-1",
						name: "fictional-default.html",
						file_extension: "html",
						is_directory: false,
					},
				]}
				selectedFileId="file-1"
				onClose={vi.fn()}
				onSelectFile={vi.fn()}
			/>,
		)

		expect(screen.getAllByTestId("mock-common-popup-default-handle")).toHaveLength(1)
		expect(container.querySelectorAll(".h-1.w-20.rounded-full")).toHaveLength(1)
	})

	it("默认文件选择器关闭按钮与分享弹窗保持相同尺寸并触发关闭", () => {
		const onClose = vi.fn()

		render(
			<DefaultOpenFilePicker
				open
				candidateTree={[]}
				onClose={onClose}
				onSelectFile={vi.fn()}
			/>,
		)

		const closeButton = screen.getByTestId("project-share-default-file-picker-close")
		const closeIcon = closeButton.querySelector("svg")

		expect(closeButton).toHaveClass("h-12", "w-12", "left-2.5")
		expect(closeButton.className).toContain("shadow-[0_8px_25px_rgba(0,0,0,0.10)]")
		expect(closeIcon).toHaveClass("h-[22px]", "w-[22px]")
		expect(closeIcon).toHaveAttribute("stroke-width", "2")

		fireEvent.click(closeButton)

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("默认文件选择器按话题文件弹窗样式固定高度并将搜索栏放在底部", () => {
		render(
			<DefaultOpenFilePicker
				open
				candidateTree={[
					{
						file_id: "file-1",
						name: "fictional-folder",
						is_directory: true,
						children: [
							{
								file_id: "file-2",
								name: "fictional-report.html",
								file_extension: "html",
								is_directory: false,
							},
						],
					},
				]}
				selectedFileId="file-2"
				onClose={vi.fn()}
				onSelectFile={vi.fn()}
			/>,
		)

		const root = screen.getByTestId("project-share-default-file-picker")
		const list = screen.getByTestId("project-share-default-file-picker-list")
		const searchRoot = screen.getByTestId("project-share-default-file-picker-search-root")
		const operationBar = screen.getByTestId("project-share-default-file-picker-breadcrumb")
		const popup = screen.getByTestId("mock-common-popup")
		const fadeContainer = screen.getByTestId("mock-scroll-edge-fade-container")
		const scrollPort = screen.getByTestId("mock-scroll-edge-fade-scroll-port")

		expect(popup).toHaveAttribute(
			"data-popup-body-classname",
			expect.stringContaining("h-[95dvh] max-h-[calc(100dvh-8px)]"),
		)
		expect(popup).toHaveAttribute("data-popup-height", "95dvh")
		expect(root.className).toContain("h-full")
		expect(fadeContainer).toHaveAttribute("data-fade-color", "mobile-background")
		expect(fadeContainer.className).toContain("flex-1")
		expect(scrollPort.className).toContain("overflow-y-auto")
		expect(scrollPort).toContainElement(list)
		expect(screen.getByTestId("project-share-default-file-picker-back-button")).toBeDisabled()
		expect(screen.getByTestId("project-share-default-file-picker-home-button")).toBeEnabled()
		expect(operationBar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
		expect(searchRoot.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_PRECEDING).toBe(
			Node.DOCUMENT_POSITION_PRECEDING,
		)
	})

	it("默认文件选择器初始空态复用移动端文件列表空态", () => {
		render(
			<DefaultOpenFilePicker
				open
				candidateTree={[]}
				onClose={vi.fn()}
				onSelectFile={vi.fn()}
			/>,
		)

		const emptyState = screen.getByTestId("project-share-default-file-picker-empty")

		expect(emptyState).toHaveAttribute("role", "status")
		expect(emptyState).toHaveTextContent("暂无文件")
		expect(emptyState).toHaveTextContent("上传或新建文件后将显示在这里。")
		expect(emptyState.querySelector("svg")).toBeInTheDocument()
		expect(emptyState).not.toHaveTextContent("projectShare.defaultOpenFileEmpty")
	})

	it("默认文件选择器搜索空态复用话题文件列表搜索空态", () => {
		render(
			<DefaultOpenFilePicker
				open
				candidateTree={[
					{
						file_id: "file-search-source",
						name: "fictional-source.html",
						file_extension: "html",
						is_directory: false,
					},
				]}
				selectedFileId="file-search-source"
				onClose={vi.fn()}
				onSelectFile={vi.fn()}
			/>,
		)

		fireEvent.change(screen.getByTestId("project-share-default-file-picker-search-input"), {
			target: { value: "missing-keyword" },
		})

		const emptyState = screen.getByTestId("project-share-default-file-picker-empty")

		expect(emptyState).toHaveAttribute("role", "status")
		expect(emptyState).toHaveTextContent("没有匹配的文件")
		expect(emptyState).toHaveTextContent("换个关键词试试。")
		expect(emptyState.querySelector("svg")).toBeInTheDocument()
		expect(emptyState).not.toHaveTextContent("projectShare.defaultOpenFileEmpty")
	})

	it("默认文件选择器特殊文件夹主体进入目录且右侧勾选区才触发选择", () => {
		const onSelectFile = vi.fn()

		render(
			<DefaultOpenFilePicker
				open
				candidateTree={[
					{
						file_id: "file-special-folder",
						name: "fictional-special-folder",
						is_directory: true,
						display_config: { type: "slide" },
						children: [
							{
								file_id: "file-child",
								name: "fictional-child.html",
								file_extension: "html",
								is_directory: false,
							},
						],
					},
				]}
				selectedFileId="file-child"
				onClose={vi.fn()}
				onSelectFile={onSelectFile}
			/>,
		)

		const specialFolderRow = screen.getByTestId("project-share-default-file-picker-folder-row")

		expect(screen.getByTestId("project-share-default-file-picker-folder-icon")).toHaveAttribute(
			"data-item-name",
			"fictional-special-folder",
		)

		fireEvent.click(
			within(specialFolderRow).getByTestId(
				"project-share-default-file-picker-folder-primary",
			),
		)

		expect(onSelectFile).not.toHaveBeenCalled()
		expect(screen.getByText("fictional-child.html")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("project-share-default-file-picker-back-button"))
		fireEvent.click(
			within(screen.getByTestId("project-share-default-file-picker-folder-row")).getByTestId(
				"project-share-default-file-picker-folder-select",
			),
		)

		expect(onSelectFile).toHaveBeenCalledWith("file-special-folder")
	})

	it("默认文件选择器搜索到特殊文件夹时仍保持主体进入目录、右侧勾选选择", () => {
		const renderSearchablePicker = (onSelectFile: (fileId: string) => void) =>
			render(
				<DefaultOpenFilePicker
					open
					candidateTree={[
						{
							file_id: "file-special-folder",
							name: "fictional-special-folder",
							is_directory: true,
							display_config: { type: "slide" },
							children: [
								{
									file_id: "file-child",
									name: "fictional-child.html",
									file_extension: "html",
									is_directory: false,
								},
							],
						},
					]}
					selectedFileId="file-child"
					onClose={vi.fn()}
					onSelectFile={onSelectFile}
				/>,
			)

		const onSelectFileFromBody = vi.fn()
		const { unmount } = renderSearchablePicker(onSelectFileFromBody)

		fireEvent.change(screen.getByTestId("project-share-default-file-picker-search-input"), {
			target: { value: "special" },
		})

		const searchFolderRow = screen.getByTestId("project-share-default-file-picker-folder-row")
		fireEvent.click(
			within(searchFolderRow).getByTestId("project-share-default-file-picker-folder-primary"),
		)

		expect(onSelectFileFromBody).not.toHaveBeenCalled()
		expect(screen.getByText("fictional-child.html")).toBeInTheDocument()

		unmount()

		const onSelectFileFromTrailingControl = vi.fn()
		renderSearchablePicker(onSelectFileFromTrailingControl)

		fireEvent.change(screen.getByTestId("project-share-default-file-picker-search-input"), {
			target: { value: "special" },
		})
		fireEvent.click(
			within(screen.getByTestId("project-share-default-file-picker-folder-row")).getByTestId(
				"project-share-default-file-picker-folder-select",
			),
		)

		expect(onSelectFileFromTrailingControl).toHaveBeenCalledWith("file-special-folder")
	})
})
