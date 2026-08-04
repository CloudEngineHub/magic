import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode, RefObject } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FilesViewer from "../index"

const mockState = vi.hoisted(() => ({
	tab: {
		id: "test-tab",
		title: "Test file",
		active: true,
		closeable: true,
		fileData: {
			file_id: "test-file",
			file_name: "test.md",
			updated_at: "2026-07-28T00:00:00Z",
		},
	},
	noop: vi.fn(),
	scrollTo: vi.fn(),
}))

vi.mock("antd", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useFullscreenMode", () => ({
	default: () => false,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		warning: vi.fn(),
	},
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => children,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: () => null,
}))

vi.mock("@/components/base/MagicSpin", () => ({
	default: () => null,
}))

vi.mock("@/components/base/HeadlessHorizontalScroll", () => ({
	default: ({
		children,
		scrollContainerRef,
	}: {
		children: ReactNode
		scrollContainerRef?: RefObject<HTMLDivElement>
	}) => <div ref={scrollContainerRef}>{children}</div>,
}))

vi.mock("../hooks/useFilesViewer", () => ({
	useFilesViewer: () => ({
		tabs: [mockState.tab],
		activeTab: mockState.tab,
		isRestoringFileTabs: false,
		openFileTab: mockState.noop,
		openWebsiteTab: mockState.noop,
		closeFileTab: mockState.noop,
		switchToTab: mockState.noop,
		clearAllTabs: mockState.noop,
		closeOtherTabs: mockState.noop,
		closeTabsToRight: mockState.noop,
		getRenderProps: () => ({ isFullscreen: false }),
		fullscreenFileId: undefined,
		handleRefresh: mockState.noop,
		handleTabDragStart: mockState.noop,
		handleTabDragEnd: mockState.noop,
		handleTabDragOver: mockState.noop,
		handleTabDrop: mockState.noop,
		draggedTab: null,
		dragOverIndex: null,
		dragDirection: null,
		openPlaybackTab: mockState.noop,
		closePlaybackTab: mockState.noop,
		isPlaybackTab: () => false,
		openKnowledgeBaseTab: mockState.noop,
		closeKnowledgeBaseTab: mockState.noop,
		isKnowledgeBaseTab: () => false,
		handleFileFullscreen: mockState.noop,
		handleExitFullscreen: mockState.noop,
		getCheckBeforeClose: () => undefined,
	}),
}))

vi.mock("../hooks/useTabCache", () => ({
	useTabCache: () => ({
		addToCache: mockState.noop,
		getFromCache: () => undefined,
		removeFromCache: mockState.noop,
		clearCache: mockState.noop,
		getCacheStats: () => ({ size: 0, maxSize: 10, keys: [] }),
		cachedTabIds: [],
	}),
}))

vi.mock("../hooks/useTabContextMenu", () => ({
	useTabContextMenu: () => ({
		contextMenuState: null,
		handleContainerContextMenu: mockState.noop,
		getContextMenuItems: () => [],
		hideContextMenu: mockState.noop,
	}),
}))

vi.mock("../components/TabCache", () => ({
	default: () => <div data-testid="files-viewer-content" />,
}))

vi.mock("../components/TabItem", () => ({
	default: ({ tab }: { tab: { id: string } }) => <div data-tab-id={tab.id} />,
}))

vi.mock("../components/TabContextMenu", () => ({
	TabContextMenu: () => null,
}))

vi.mock("../components/FileTabMagicIcon", () => ({
	FileTabMagicIcon: () => null,
}))

vi.mock("../components/WebsitePresetMenu", () => ({
	default: () => null,
}))

vi.mock("../components/CommonWebsitePresetDialog", () => ({
	default: () => null,
}))

vi.mock("../utils/websiteTabs", () => ({
	COMMON_WEBSITE_PRESETS_LIMIT: 10,
	getWebsiteTabData: () => ({}),
	saveCommonWebsitePreset: () => ({ status: "saved" }),
}))

vi.mock("../utils/fullscreenSafeArea", () => ({
	FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_VIEWPORT_CLASS_NAME: "document-flow-fullscreen",
	FILE_VIEWER_FULLSCREEN_SAFE_AREA_CLASS_NAME: "fullscreen-safe-area",
	FILE_VIEWER_FULLSCREEN_VIEWPORT_CLASS_NAME: "fullscreen",
	shouldUseFileViewerFullscreenSafeArea: () => false,
}))

vi.mock("../../DetailEmpty", () => ({
	default: () => null,
}))

beforeEach(() => {
	mockState.tab.id = "test-tab"
	Object.defineProperty(HTMLElement.prototype, "scrollTo", {
		configurable: true,
		value: mockState.scrollTo,
	})
})

afterEach(() => {
	cleanup()
	mockState.scrollTo.mockReset()
})

describe("FilesViewer fullscreen portal", () => {
	it("keeps document-flow fullscreen content in the share document tree", () => {
		const { container } = render(<FilesViewer forceFullscreenMode documentFlowFullscreen />)

		expect(container.querySelector('[data-testid="files-viewer-content"]')).toBeTruthy()
	})

	it("keeps regular fullscreen content in the body portal", () => {
		const { container } = render(<FilesViewer forceFullscreenMode />)

		expect(container.querySelector('[data-testid="files-viewer-content"]')).toBeNull()
		expect(screen.getByTestId("files-viewer-content")).toBeInTheDocument()
	})

	it("centers an active tab without interpreting its id as a CSS selector", () => {
		mockState.tab.id =
			'pending-attachment-path:个人使用画像/个人AI协作画像.md]\n\n10. 部分 [unknown"'

		expect(() => render(<FilesViewer />)).not.toThrow()
		expect(mockState.scrollTo).toHaveBeenCalledOnce()
	})
})
