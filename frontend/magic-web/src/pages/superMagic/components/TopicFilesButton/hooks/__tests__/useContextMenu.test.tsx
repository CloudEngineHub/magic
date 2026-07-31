import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { useContextMenu } from "../useContextMenu"
import type { AttachmentItem } from "../types"
import type { TopicFilesMenuItem } from "../../utils/menu-items"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@tabler/icons-react", () => {
	function IconStub() {
		return null
	}

	return {
		IconDownload: IconStub,
		IconEdit: IconStub,
		IconFolderPlus: IconStub,
		IconFolderUp: IconStub,
		IconUpload: IconStub,
		IconShare: IconStub,
		IconTrash: IconStub,
		IconFile: IconStub,
		IconMessageCircleShare: IconStub,
		IconMessageCirclePlus: IconStub,
		IconFolderSymlink: IconStub,
		IconReplace: IconStub,
		IconFolders: IconStub,
		IconSquareCheck: IconStub,
		IconInfoCircle: IconStub,
		IconCopy: IconStub,
	}
})

vi.mock("@/enhance/tabler/icons-react/icons/IconOpenWindow", () => ({
	default: () => null,
}))

vi.mock("antd", () => ({
	Flex: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: () => null,
}))

vi.mock("@/components/base/MagicFileIcon", () => ({
	default: () => null,
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: {
		confirm: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: vi.fn(),
	},
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/providers/file-action-visibility-provider", () => ({
	useFileActionVisibility: () => ({
		hideCopyTo: false,
		hideCreateNewTopic: false,
		hideMoveTo: false,
		hideShareFile: false,
	}),
}))

vi.mock("../../style", () => ({
	useStyles: () => ({
		styles: {
			danger: "danger",
			menuItemShortcut: "menuItemShortcut",
			menuItemShortcutItem: "menuItemShortcutItem",
		},
	}),
}))

vi.mock("../../components/MagicSystemFolderIcon", () => ({
	MagicSystemFolderIcon: () => null,
}))

vi.mock("../../../VIPTag", () => ({
	default: () => null,
}))

vi.mock("../useMobileDeleteConfirmSheet", () => ({
	useMobileDeleteConfirmSheet: () => ({
		deleteConfirmNode: null,
		openDeleteConfirm: vi.fn(),
	}),
}))

function createOptions(overrides: Partial<Parameters<typeof useContextMenu>[0]> = {}) {
	return {
		handleUploadFile: vi.fn(),
		handleUploadFolder: vi.fn(),
		handleShareItem: vi.fn(),
		handleDeleteItem: vi.fn(),
		handleDownloadOriginal: vi.fn(),
		handleDownloadPdf: vi.fn(),
		handleDownloadPpt: vi.fn(),
		handleDownloadPptx: vi.fn(),
		handleOpenFile: vi.fn(),
		handleStartRename: vi.fn(),
		handleAddToCurrentChat: vi.fn(),
		handleAddToNewChat: vi.fn(),
		handleMoveFile: vi.fn(),
		handleReplaceFile: vi.fn(),
		onCopyFile: vi.fn(),
		createVirtualFile: vi.fn(),
		createVirtualFolder: vi.fn(),
		handleEnterMultiSelectMode: vi.fn(),
		...overrides,
	}
}

function getMenuKeys(items: TopicFilesMenuItem[]) {
	return items.filter((item) => item && item.type !== "divider").map((item) => String(item?.key))
}

function getSubMenuItems(items: TopicFilesMenuItem[], key: string): TopicFilesMenuItem[] {
	const item = items.find((menuItem) => menuItem?.key === key)
	if (!item || !("children" in item) || !Array.isArray(item.children)) return []
	return item.children as TopicFilesMenuItem[]
}

function expectCopyPathInReferenceGroup(keys: string[]) {
	const shareIndex = keys.indexOf("share")
	const copyPathIndex = keys.indexOf("copyPath")
	const selectMultipleIndex = keys.indexOf("selectMultiple")

	expect(shareIndex).toBeGreaterThanOrEqual(0)
	expect(copyPathIndex).toBeGreaterThan(shareIndex)
	expect(selectMultipleIndex).toBeGreaterThan(copyPathIndex)
}

describe("useContextMenu copy path menu", () => {
	it("places copy path in the reference group for file rows", () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "report.md",
			is_directory: false,
			relative_file_path: "/docs/report.md",
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))
		const keys = getMenuKeys(result.current.getMenuItems(file))

		expect(keys).toContain("copyPath")
		expectCopyPathInReferenceGroup(keys)
	})

	it("places copy path in the reference group for folder rows", () => {
		const folder: AttachmentItem = {
			file_id: "folder-1",
			name: "docs",
			is_directory: true,
			relative_file_path: "/docs",
			children: [],
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))
		const keys = getMenuKeys(result.current.getMenuItems(folder))

		expect(keys).toContain("copyPath")
		expectCopyPathInReferenceGroup(keys)
	})
})

describe("useContextMenu project creation menu", () => {
	it("hides project creation entries in slide project folders", () => {
		const createVirtualDesignProject = vi.fn()
		const createVirtualSelfMediaProject = vi.fn()
		const createVirtualAICardProject = vi.fn()
		const folder: AttachmentItem = {
			file_id: "slide-folder-1",
			name: "季度汇报",
			is_directory: true,
			relative_file_path: "/季度汇报",
			display_config: { type: "slide" },
			children: [],
		}

		const { result } = renderHook(() =>
			useContextMenu(
				createOptions({
					createVirtualDesignProject,
					createVirtualSelfMediaProject,
					createVirtualAICardProject,
				}),
			),
		)
		const createItems = getSubMenuItems(result.current.getMenuItems(folder), "createFile")
		const createKeys = getMenuKeys(createItems)

		expect(createKeys).not.toContain("createDesign")
		expect(createKeys).not.toContain("createSelfMedia")
		expect(createKeys).not.toContain("createAICard")
		expect(createVirtualDesignProject).not.toHaveBeenCalled()
		expect(createVirtualSelfMediaProject).not.toHaveBeenCalled()
		expect(createVirtualAICardProject).not.toHaveBeenCalled()
	})
})
