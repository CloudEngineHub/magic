import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ShareMode, ShareType } from "@/pages/superMagic/components/Share/types"
import ProjectShareCreateView from "../components/ProjectShareCreateView"
import type { ProjectShareSheetController } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === "projectShare.expiryDays" && typeof options?.days === "number") {
				return `${options.days} days`
			}
			if (key === "projectShare.selectedMembersCount" && typeof options?.count === "number") {
				return `${options.count} selected`
			}
			if (key === "projectShare.selectedFilesCount" && typeof options?.count === "number") {
				return `${options.count} files`
			}
			return key
		},
	}),
}))

vi.mock("@/components/business/MemberDepartmentSelector", () => ({
	default: () => null,
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon",
	() => ({
		MobileAttachmentRowIcon: ({
			item,
			attachments,
			dataTestId,
		}: {
			item: { file_id?: string; name?: string; file_name?: string }
			attachments: Array<{ file_id?: string }>
			dataTestId?: string
		}) => (
			<span
				data-testid={dataTestId || "mock-mobile-attachment-row-icon"}
				data-item-id={item.file_id}
				data-item-name={item.name || item.file_name}
				data-attachment-count={attachments.length}
			/>
		),
	}),
)

/**
 * 构造最小 controller 数据，专门覆盖创建分享页的交互结构测试。
 */
function createController(
	overrides: Partial<ProjectShareSheetController> = {},
): ProjectShareSheetController {
	return {
		open: true,
		view: "create",
		viewStack: [],
		mode: "project",
		projectMode: "",
		shareMode: ShareMode.Project,
		projectName: "Demo Project",
		projectId: "project-1",
		formState: {
			shareName: "Demo Project",
			shareType: ShareType.Public,
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
		advancedOpen: true,
		defaultSelectedFileIds: [],
		selectedFileIds: [],
		groupedShareItems: [],
		enableInlineFileSelection: false,
		selectedFileItems: [],
		selectedFileHierarchy: [],
		selectedFileCount: 0,
		defaultOpenFileId: undefined,
		defaultOpenFileItem: undefined,
		defaultOpenFileCandidates: [],
		defaultOpenFileCandidateTree: [],
		defaultOpenFilePickerOpen: false,
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
		closeDefaultOpenFilePicker: vi.fn(),
		selectDefaultOpenFile: vi.fn(),
		submitCreateShare: vi.fn(async () => undefined),
		openEditSelectedShare: vi.fn(),
		confirmCancelShare: vi.fn(async () => undefined),
		editResourceId: undefined,
		closeEditModal: vi.fn(),
		...overrides,
	}
}

describe("ProjectShareCreateView", () => {
	it("高级设置行不会产生 button 嵌套告警", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

		render(<ProjectShareCreateView controller={createController()} />)

		const nestingWarnings = consoleErrorSpy.mock.calls
			.flat()
			.filter(
				(value) =>
					typeof value === "string" &&
					value.includes("<button> cannot appear as a descendant of <button>"),
			)

		expect(nestingWarnings).toHaveLength(0)

		consoleErrorSpy.mockRestore()
	})

	it("reserves scroll space for the fixed sheet footer", () => {
		render(<ProjectShareCreateView controller={createController()} />)

		expect(
			screen.getByTestId("project-share-sheet-create-floating-bar-scroll-spacer"),
		).toBeInTheDocument()
	})

	it("文件模式会展示固定文案的已选文件区块，并支持展开文件夹层级", () => {
		render(
			<ProjectShareCreateView
				controller={createController({
					mode: "file",
					selectedFileCount: 3,
					selectedFileItems: [
						{ file_id: "folder-1", name: "测试画布", is_directory: true },
					],
					selectedFileHierarchy: [
						{
							id: "folder-1",
							name: "测试画布",
							isDirectory: true,
							children: [
								{
									id: "file-1",
									name: "需求文档.md",
									isDirectory: false,
									children: [],
								},
								{
									id: "folder-2",
									name: "素材",
									isDirectory: true,
									children: [
										{
											id: "file-2",
											name: "原型图.png",
											isDirectory: false,
											children: [],
										},
										{
											id: "file-3",
											name: "说明.txt",
											isDirectory: false,
											children: [],
										},
									],
								},
							],
						},
					],
				})}
			/>,
		)

		const trigger = screen.getByTestId("project-share-sheet-selected-files-trigger")
		expect(trigger).toHaveTextContent("projectShare.selectedFilesLabel")
		expect(trigger).toHaveTextContent("3")

		fireEvent.click(trigger)
		fireEvent.click(screen.getByTestId("project-share-sheet-selected-file-row-folder-1"))
		fireEvent.click(screen.getByTestId("project-share-sheet-selected-file-row-folder-2"))

		expect(screen.getByText("需求文档.md")).toBeInTheDocument()
		expect(screen.getByText("原型图.png")).toBeInTheDocument()
		expect(screen.getByText("说明.txt")).toBeInTheDocument()
	})

	it("文件模式展示默认打开文件并支持点击打开选择器", () => {
		const openDefaultOpenFilePicker = vi.fn()

		render(
			<ProjectShareCreateView
				controller={createController({
					mode: "file",
					defaultOpenFileId: "file-1",
					defaultOpenFileItem: {
						file_id: "file-1",
						name: "fictional-photo.jpg",
						file_name: "fictional-photo.jpg",
						file_extension: "jpg",
						is_directory: false,
					},
					defaultOpenFileCandidates: [
						{
							file_id: "file-1",
							name: "fictional-photo.jpg",
							file_extension: "jpg",
							is_directory: false,
						},
					],
					openDefaultOpenFilePicker,
				})}
			/>,
		)

		const trigger = screen.getByTestId("project-share-sheet-default-open-file-trigger")
		expect(trigger).toHaveTextContent("projectShare.defaultOpenFileLabel")
		expect(trigger).toHaveTextContent("fictional-photo.jpg")

		fireEvent.click(trigger)

		expect(openDefaultOpenFilePicker).toHaveBeenCalledTimes(1)
	})

	it("编辑文件分享时在已选文件行提供编辑图标", () => {
		const openFileSelector = vi.fn()

		render(
			<ProjectShareCreateView
				controller={createController({
					mode: "file",
					isEditing: true,
					openFileSelector,
					selectedFileCount: 1,
					selectedFileHierarchy: [
						{
							id: "fictional-selected-file",
							name: "fictional-selected.html",
							isDirectory: false,
							children: [],
						},
					],
				})}
			/>,
		)

		fireEvent.click(
			screen.getByTestId("project-share-sheet-selected-files-trigger-edit-button"),
		)

		expect(openFileSelector).toHaveBeenCalledTimes(1)
	})

	it("项目模式也展示默认打开文件并支持点击打开选择器", () => {
		const openDefaultOpenFilePicker = vi.fn()

		render(
			<ProjectShareCreateView
				controller={createController({
					mode: "project",
					defaultOpenFileId: "file-1",
					defaultOpenFileItem: {
						file_id: "file-1",
						name: "fictional-dashboard.html",
						file_name: "fictional-dashboard.html",
						file_extension: "html",
						is_directory: false,
					},
					defaultOpenFileCandidates: [
						{
							file_id: "file-1",
							name: "fictional-dashboard.html",
							file_extension: "html",
							is_directory: false,
						},
					],
					openDefaultOpenFilePicker,
				})}
			/>,
		)

		const trigger = screen.getByTestId("project-share-sheet-default-open-file-trigger")
		expect(trigger).toHaveTextContent("projectShare.defaultOpenFileLabel")
		expect(trigger).toHaveTextContent("fictional-dashboard.html")

		fireEvent.click(trigger)

		expect(openDefaultOpenFilePicker).toHaveBeenCalledTimes(1)
	})

	it("项目模式默认打开特殊文件夹摘要行复用移动端文件图标规则", () => {
		const openDefaultOpenFilePicker = vi.fn()

		render(
			<ProjectShareCreateView
				controller={createController({
					mode: "project",
					defaultOpenFileId: "file-special-folder",
					defaultOpenFileItem: {
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
					defaultOpenFileCandidates: [
						{
							file_id: "file-special-folder",
							name: "fictional-special-folder",
							is_directory: true,
							display_config: { type: "slide" },
						},
					],
					defaultOpenFileCandidateTree: [
						{
							file_id: "file-special-folder",
							name: "fictional-special-folder",
							is_directory: true,
							display_config: { type: "slide" },
						},
					],
					openDefaultOpenFilePicker,
				})}
			/>,
		)

		const trigger = screen.getByTestId("project-share-sheet-default-open-file-trigger")
		const icon = screen.getByTestId("project-share-sheet-default-open-file-icon")

		expect(trigger).toHaveTextContent("fictional-special-folder")
		expect(icon).toHaveAttribute("data-item-id", "file-special-folder")
		expect(icon).toHaveAttribute("data-item-name", "fictional-special-folder")
		expect(icon).toHaveAttribute("data-attachment-count", "1")

		fireEvent.click(trigger)

		expect(openDefaultOpenFilePicker).toHaveBeenCalledTimes(1)
	})
})
