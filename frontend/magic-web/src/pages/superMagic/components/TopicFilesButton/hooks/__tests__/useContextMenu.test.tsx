import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, beforeEach, vi } from "vitest"
import { useContextMenu } from "../useContextMenu"
import type { AttachmentItem } from "../types"
import type { TopicFilesMenuItem } from "../../utils/menu-items"
import { buildAttachmentIndex } from "../../utils/attachmentIndex"
import magicToast from "@/components/base/MagicToaster/utils"
import { clipboard } from "@/utils/clipboard-helpers"

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
		...overrides,
	}
}

function findMenuItem(items: TopicFilesMenuItem[], key: string) {
	return items.find((item) => item && item.type !== "divider" && item.key === key) as
		| (TopicFilesMenuItem & { onClick?: () => void })
		| undefined
}

describe("useContextMenu copy path", () => {
	beforeEach(() => {
		vi.mocked(clipboard.writeText).mockReset()
		vi.mocked(magicToast.success).mockReset()
		vi.mocked(magicToast.error).mockReset()
		vi.mocked(clipboard.writeText).mockResolvedValue(undefined)
	})

	it("shows copy path for file rows and copies relative_file_path", async () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "report.md",
			is_directory: false,
			relative_file_path: "/docs/report.md",
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))
		const copyPathItem = findMenuItem(result.current.getMenuItems(file), "copyPath")

		expect(copyPathItem?.label).toBe("topicFiles.contextMenu.copyPath")

		await act(async () => {
			copyPathItem?.onClick?.()
		})

		await waitFor(() => {
			expect(clipboard.writeText).toHaveBeenCalledWith("/docs/report.md")
		})
		expect(magicToast.success).toHaveBeenCalledWith("topicFiles.contextMenu.copyPathSuccess")
	})

	it("shows copy path for folder rows", () => {
		const folder: AttachmentItem = {
			file_id: "folder-1",
			name: "docs",
			is_directory: true,
			relative_file_path: "/docs",
			children: [],
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))

		expect(findMenuItem(result.current.getMenuItems(folder), "copyPath")).toBeTruthy()
	})

	it("uses tree index path when a folder has no relative_file_path", async () => {
		const childFolder: AttachmentItem = {
			file_id: "folder-2",
			name: "reports",
			is_directory: true,
			children: [],
		}
		const attachments: AttachmentItem[] = [
			{
				file_id: "folder-1",
				name: "docs",
				is_directory: true,
				children: [childFolder],
			},
		]

		const { result } = renderHook(() =>
			useContextMenu(createOptions({ treeIndex: buildAttachmentIndex(attachments) })),
		)
		const copyPathItem = findMenuItem(result.current.getMenuItems(childFolder), "copyPath")

		await act(async () => {
			copyPathItem?.onClick?.()
		})

		await waitFor(() => {
			expect(clipboard.writeText).toHaveBeenCalledWith("/docs/reports/")
		})
	})

	it("falls back to path-like fields when relative_file_path is missing", async () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "fallback-name.md",
			is_directory: false,
			file_key: "/from-file-key.md",
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))
		const copyPathItem = findMenuItem(result.current.getMenuItems(file), "copyPath")

		await act(async () => {
			copyPathItem?.onClick?.()
		})

		await waitFor(() => {
			expect(clipboard.writeText).toHaveBeenCalledWith("/from-file-key.md")
		})
	})

	it("shows failure toast without writing an empty path", async () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			is_directory: false,
		}

		const { result } = renderHook(() => useContextMenu(createOptions()))
		const copyPathItem = findMenuItem(result.current.getMenuItems(file), "copyPath")

		await act(async () => {
			copyPathItem?.onClick?.()
		})

		expect(clipboard.writeText).not.toHaveBeenCalled()
		expect(magicToast.error).toHaveBeenCalledWith("topicFiles.contextMenu.copyPathFailed")
	})
})
