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
