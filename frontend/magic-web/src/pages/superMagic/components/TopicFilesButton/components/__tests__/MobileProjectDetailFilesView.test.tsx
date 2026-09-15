import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MobileProjectDetailFilesView from "../MobileProjectDetailFilesView"
import type { AttachmentItem } from "../../hooks/types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { detectContentTypeRender } from "@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview"
import { DetailType } from "@/pages/superMagic/components/Detail/types"

vi.mock("@/models/repository/Cache", () => ({
	Storage: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn(),
		allClear: vi.fn(),
		key: vi.fn(),
		getAll: vi.fn(() => []),
		clearById: vi.fn(),
		length: 0,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		// Keep this focused mock close to the empty-state copy used by the view under test.
		t: (key: string) => {
			if (key === "mobile.emptyState.variants.chatFilesSearch.title") {
				return "No matching files"
			}
			if (key === "mobile.emptyState.variants.chatFilesSearch.description") {
				return "Try a different search term."
			}

			return key
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base-mobile/MagicPullToRefresh", () => ({
	default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: () => <div />,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: vi.fn(),
		success: vi.fn(),
		loading: vi.fn(),
		destroy: vi.fn(),
	},
}))

vi.mock("@/components/shadcn-ui/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props}>{children}</button>
	),
}))

vi.mock("@/pages/superMagic/components/Detail/components/FilesViewer/utils/preview", () => ({
	detectContentTypeRender: vi.fn(() => null),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment/utils", () => ({
	getAppEntryFile: vi.fn(() => null),
	getAttachmentType: vi.fn(() => undefined),
	getChildrenForCustomMetadataIconPath: vi.fn(() => []),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/hooks/fileSelectionUtils", () => ({
	findFileInTree: vi.fn(() => null),
}))

vi.mock("@/pages/superMagicMobile/components/MobileBottomSearchBar", () => ({
	// Preserve the search input contract so the view test exercises real state updates.
	default: ({
		value,
		onValueChange,
		testIdPrefix,
	}: {
		value: string
		onValueChange: (value: string) => void
		testIdPrefix: string
	}) => (
		<input
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
			data-testid={`${testIdPrefix}-input`}
		/>
	),
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeContainer: ({ children }: { children?: React.ReactNode }) => (
		<div data-testid="mobile-files-scroll-edge-fade">{children}</div>
	),
}))

vi.mock("../MobileFilesSelectionBar", () => ({
	default: () => <div />,
}))

vi.mock("../MobileFileDownloadSheet", () => ({
	MobileFileDownloadSheet: () => null,
}))

vi.mock("../CustomFolderMagicIcon", () => ({
	CustomFolderMagicIcon: () => <div />,
}))

vi.mock("../TopicFileIcon", () => ({
	TopicFileIcon: () => <div />,
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/utils/build-single-file-download-menu",
	() => ({
		menuItemsIncludeNoWaterMarkDownload: vi.fn(() => false),
	}),
)

vi.mock("@/pages/superMagic/components/TopicFilesButton/utils/magic-system-folder", () => ({
	isMagicSystemFolder: vi.fn(() => false),
}))

vi.mock("@/pages/superMagic/components/TopicFilesButton/utils/getAttachmentKey", () => ({
	getAttachmentDisplayName: (item: AttachmentItem) => item.name || item.file_name || "",
	getAttachmentKey: (item: AttachmentItem) => item.file_id || item.name || "",
	getVisibleAttachmentChildren: (item: AttachmentItem) => item.children || [],
}))

vi.mock(
	"@/pages/superMagic/components/TopicFilesButton/utils/mobileAttachmentTreeSelection",
	() => ({
		collectAttachmentsBySelectedKeys: vi.fn(() => []),
		collectCurrentViewSelectableKeys: vi.fn(() => ["mock-file-id"]),
		getAttachmentNodeSelectionState: vi.fn(() => "none"),
		toggleAllInCurrentView: vi.fn((_: string[], selected: Set<string>) => selected),
		toggleAttachmentSelection: vi.fn((_: string, selected: Set<string>) => selected),
	}),
)

vi.mock("../MobileFileSelectionCheckbox", () => ({
	default: () => null,
}))

describe("MobileProjectDetailFilesView", () => {
	it("打开移动端 PPT 文件夹时保留路径映射字段", () => {
		const setUserSelectDetail = vi.fn()
		const dataTransformer = vi.fn((item: FileItem) => ({
			relative_file_path: item.relative_file_path,
			parent_id: item.parent_id,
			display_config: item.display_config,
		}))

		vi.mocked(detectContentTypeRender).mockReturnValueOnce({
			displayConfigType: "slide",
			detailType: DetailType.Html,
			dataTransformer,
		})

		const attachments: AttachmentItem[] = [
			{
				file_id: "deck-folder",
				name: "X11项目一页汇报",
				is_directory: true,
				relative_file_path: "/projects/x11/deck",
				parent_id: "project-root",
				display_config: {
					type: "slide",
					slides: ["slides/slide-1.html"],
				},
				children: [],
			},
		]

		render(
			<MobileProjectDetailFilesView
				attachments={attachments}
				setUserSelectDetail={setUserSelectDetail}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-folder-button"))

		expect(dataTransformer).toHaveBeenCalledWith(
			expect.objectContaining({
				file_id: "deck-folder",
				relative_file_path: "/projects/x11/deck",
				parent_id: "project-root",
			}),
		)
		expect(setUserSelectDetail).toHaveBeenCalledWith(
			expect.objectContaining({
				type: DetailType.Html,
				currentFileId: "deck-folder",
				data: expect.objectContaining({
					relative_file_path: "/projects/x11/deck",
					parent_id: "project-root",
				}),
			}),
		)
	})

	it("为移动端文件列表的每一行提供稳定的自动化选择器", () => {
		const attachments: AttachmentItem[] = [
			{
				file_id: "folder-alpha",
				name: "测试目录",
				is_directory: true,
				children: [],
			},
			{
				file_id: "file-beta",
				file_name: "sample-doc.md",
				is_directory: false,
				file_extension: "md",
			},
		]

		render(
			<MobileProjectDetailFilesView
				attachments={attachments}
				mobileViewVariant="project-detail"
			/>,
		)

		const rows = screen.getAllByTestId("project-detail-mobile-file-row")

		expect(rows).toHaveLength(2)
		expect(rows[0]).toHaveAttribute("data-file-id", "folder-alpha")
		expect(rows[0]).toHaveAttribute("data-file-kind", "folder")
		expect(rows[1]).toHaveAttribute("data-file-id", "file-beta")
		expect(rows[1]).toHaveAttribute("data-file-kind", "file")
	})

	it("深层路径栏支持横向滚动并放宽单段文本展示宽度", () => {
		const attachments: AttachmentItem[] = [
			{
				file_id: "folder-1",
				name: "测试特殊长目录名称第一层",
				is_directory: true,
				relative_file_path: "/测试特殊长目录名称第一层",
				children: [
					{
						file_id: "folder-2",
						name: ".magic-第二层超长目录",
						is_directory: true,
						relative_file_path: "/测试特殊长目录名称第一层/.magic-第二层超长目录",
						children: [
							{
								file_id: "folder-3",
								name: "memory-第三层超长目录",
								is_directory: true,
								relative_file_path:
									"/测试特殊长目录名称第一层/.magic-第二层超长目录/memory-第三层超长目录",
								children: [],
							},
						],
					},
				],
			},
		]

		const { container } = render(
			<MobileProjectDetailFilesView
				attachments={attachments}
				mobileViewVariant="project-detail"
			/>,
		)

		expect(screen.getByTestId("project-detail-mobile-back-button")).toBeInTheDocument()
		expect(screen.getByTestId("project-detail-mobile-home-button")).toBeInTheDocument()

		fireEvent.click(screen.getAllByRole("button", { name: /测试特殊长目录名称第一层/ })[0])
		fireEvent.click(screen.getAllByRole("button", { name: /\.magic-第二层超长目录/ })[0])

		const scrollContainer = container.querySelector(".overflow-x-auto")
		expect(scrollContainer).toBeTruthy()
		expect(scrollContainer?.className).toContain("no-scrollbar")

		const breadcrumbButton = screen
			.getAllByRole("button", { name: /测试特殊长目录名称第一层/ })
			.find((button) => button.className.includes("max-w-[168px]"))

		expect(breadcrumbButton).toBeTruthy()
		if (!breadcrumbButton) {
			throw new Error("Expected breadcrumb button to be rendered")
		}
		expect(breadcrumbButton.className).toContain("max-w-[168px]")
	})

	it("添加按钮脱离滚动渐隐容器以避免被底部搜索栏阴影遮挡", () => {
		render(
			<MobileProjectDetailFilesView
				attachments={[]}
				allowEdit
				mobileViewVariant="chat-sheet"
			/>,
		)

		const addButton = screen.getByTestId("project-detail-files-add-button")
		const scrollFadeContainer = screen.getByTestId("mobile-files-scroll-edge-fade")

		expect(scrollFadeContainer).not.toContainElement(addButton)
		expect(addButton.className).toContain("z-30")
	})

	it("搜索无结果时还原原型空态并在剩余区域居中展示", () => {
		const attachments: AttachmentItem[] = [
			{
				file_id: "file-report-001",
				file_name: "summary-note.md",
				is_directory: false,
				file_extension: "md",
			},
		]

		render(
			<MobileProjectDetailFilesView
				attachments={attachments}
				mobileViewVariant="project-detail"
			/>,
		)

		fireEvent.change(screen.getByTestId("project-detail-files-search-input"), {
			target: { value: "missing-keyword" },
		})

		const emptyState = screen.getByTestId("mobile-files-search-empty")

		expect(emptyState).toHaveTextContent("No matching files")
		expect(emptyState).toHaveTextContent("Try a different search term.")
		expect(emptyState).toHaveAttribute("role", "status")
		expect(emptyState.className).toContain("flex-1")
		expect(emptyState.className).toContain("justify-center")
		expect(emptyState.querySelector("svg")).toBeInTheDocument()
		expect(emptyState).not.toHaveTextContent("projectDetail.searchEmptyDescription")
		expect(emptyState).not.toHaveTextContent("search.searchEmptyDescription")
	})
})
