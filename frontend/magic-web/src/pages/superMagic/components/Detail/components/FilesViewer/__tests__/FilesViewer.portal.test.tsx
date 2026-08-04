import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode, RefObject } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import FilesViewer from "../index"

interface MockFileData {
	file_id: string
	file_name: string
	file_extension?: string
	updated_at: string
	is_directory?: boolean
	display_config?: { type?: string }
}

interface MockTab {
	id: string
	title: string
	active: boolean
	closeable: boolean
	fileData: MockFileData
}

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
	} as MockTab,
	noop: vi.fn(),
	scrollTo: vi.fn(),
	pptMount: vi.fn(),
	pptUnmount: vi.fn(),
}))
let restoreBoundingClientRect: (() => void) | undefined

vi.mock("antd", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useFullscreenMode", () => ({
	default: () => false,
}))

vi.mock("@/pages/superMagic/hooks/useShareRoute", () => ({
	default: () => ({ isShareRoute: false }),
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
		getRenderProps: (tab?: { fileData?: MockFileData }) => ({
			isFullscreen: false,
			type: tab?.fileData?.display_config?.type === "slide" ? "html" : "md",
			data: tab?.fileData,
			attachmentList: tab?.fileData ? [tab.fileData] : [],
		}),
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

vi.mock("../components/TabCache", async () => {
	const { useEffect } = await vi.importActual<typeof import("react")>("react")

	function MockPPTContent() {
		useEffect(() => {
			mockState.pptMount()
			return () => mockState.pptUnmount()
		}, [])

		return <div data-testid="ppt-content" />
	}

	return {
		default: ({ tab }: { tab: { fileData?: MockFileData } }) =>
			tab.fileData?.display_config?.type === "slide" ? (
				<MockPPTContent />
			) : (
				<div data-testid="files-viewer-content" />
			),
	}
})

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
	FILE_VIEWER_FULLSCREEN_SAFE_AREA_CLASS_NAME: "fullscreen-safe-area",
	FILE_VIEWER_FULLSCREEN_VIEWPORT_CLASS_NAME: "fullscreen",
	shouldUseFileViewerFullscreenSafeArea: () => false,
}))

vi.mock("../../DetailEmpty", () => ({
	default: () => null,
}))

beforeEach(() => {
	Object.assign(mockState.tab, {
		id: "test-tab",
		title: "Test file",
		active: true,
		closeable: true,
		fileData: {
			file_id: "test-file",
			file_name: "test.md",
			file_extension: "md",
			updated_at: "2026-07-28T00:00:00Z",
		},
	})
	Object.defineProperty(HTMLElement.prototype, "scrollTo", {
		configurable: true,
		value: mockState.scrollTo,
	})
	mockState.pptMount.mockReset()
	mockState.pptUnmount.mockReset()
})

afterEach(() => {
	cleanup()
	restoreBoundingClientRect?.()
	restoreBoundingClientRect = undefined
	mockState.scrollTo.mockReset()
})

describe("FilesViewer fullscreen portal", () => {
	it("keeps non-PPT content on the existing viewer portal path", () => {
		const { container, rerender } = render(<FilesViewer />)
		const inlineContent = container.querySelector('[data-testid="files-viewer-content"]')

		expect(inlineContent).toBeTruthy()

		rerender(<FilesViewer forceFullscreenMode />)

		expect(container.querySelector('[data-testid="files-viewer-content"]')).toBeNull()
		const fullscreenContent = screen.getByTestId("files-viewer-content")
		expect(fullscreenContent).toBeInTheDocument()
		expect(fullscreenContent).not.toBe(inlineContent)
	})

	it("does not remount PPT content when entering or exiting viewer fullscreen", () => {
		mockState.tab.fileData = {
			file_id: "ppt-folder",
			file_name: "Test deck",
			file_extension: "",
			is_directory: true,
			updated_at: "2026-07-28T00:00:00Z",
			display_config: { type: "slide" },
		}
		const anchorRect = {
			x: 120,
			y: 44,
			top: 44,
			right: 1080,
			bottom: 584,
			left: 120,
			width: 960,
			height: 540,
			toJSON: () => ({}),
		} as DOMRect
		const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
		const getBoundingClientRectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: HTMLElement) {
				return this.dataset.filesViewerPptAnchor === "true"
					? anchorRect
					: originalGetBoundingClientRect.call(this)
			})
		restoreBoundingClientRect = () => getBoundingClientRectSpy.mockRestore()

		const { rerender, unmount } = render(<FilesViewer />)
		const initialContent = screen.getByTestId("ppt-content")
		const initialPortalHost = document.querySelector<HTMLElement>(
			'[data-files-viewer-ppt-portal="true"]',
		)

		expect(mockState.pptMount).toHaveBeenCalledOnce()
		expect(mockState.pptUnmount).not.toHaveBeenCalled()
		expect(initialPortalHost).toBeInTheDocument()
		expect(initialPortalHost?.style.top).toBe("44px")
		expect(initialPortalHost?.style.left).toBe("120px")
		expect(initialPortalHost?.style.width).toBe("960px")
		expect(initialPortalHost?.style.height).toBe("540px")
		expect(initialPortalHost?.style.visibility).toBe("visible")
		expect(initialPortalHost?.style.pointerEvents).toBe("auto")
		expect(initialPortalHost?.style.zIndex).toBe("10")
		expect(initialPortalHost?.style.borderRadius).toBe("0px 0px 0.5rem 0.5rem")
		expect(initialPortalHost).not.toHaveAttribute("aria-hidden")
		initialPortalHost?.setAttribute("aria-hidden", "true")

		rerender(<FilesViewer forceFullscreenMode />)

		const fullscreenPortalHost = document.querySelector<HTMLElement>(
			'[data-files-viewer-ppt-portal="true"]',
		)
		expect(screen.getByTestId("ppt-content")).toBe(initialContent)
		expect(fullscreenPortalHost).toBe(initialPortalHost)
		expect(fullscreenPortalHost?.style.visibility).toBe("visible")
		expect(fullscreenPortalHost?.style.pointerEvents).toBe("auto")
		expect(fullscreenPortalHost?.style.zIndex).toBe(
			"calc(var(--z-index-detail-fullscreen) + 1)",
		)
		expect(fullscreenPortalHost?.style.borderRadius).toBe("0px")
		expect(fullscreenPortalHost).toHaveAttribute("aria-hidden", "true")
		expect(mockState.pptMount).toHaveBeenCalledOnce()
		expect(mockState.pptUnmount).not.toHaveBeenCalled()
		fullscreenPortalHost?.removeAttribute("aria-hidden")

		rerender(<FilesViewer forceFullscreenMode={false} />)

		expect(screen.getByTestId("ppt-content")).toBe(initialContent)
		expect(document.querySelector<HTMLElement>('[data-files-viewer-ppt-portal="true"]')).toBe(
			initialPortalHost,
		)
		expect(initialPortalHost?.style.zIndex).toBe("10")
		expect(initialPortalHost?.style.borderRadius).toBe("0px 0px 0.5rem 0.5rem")
		expect(mockState.pptMount).toHaveBeenCalledOnce()
		expect(mockState.pptUnmount).not.toHaveBeenCalled()

		rerender(<FilesViewer hideTabBar />)

		expect(screen.getByTestId("ppt-content")).toBe(initialContent)
		expect(initialPortalHost?.style.borderRadius).toBe("0.5rem")
		expect(mockState.pptMount).toHaveBeenCalledOnce()
		expect(mockState.pptUnmount).not.toHaveBeenCalled()

		unmount()

		expect(mockState.pptUnmount).toHaveBeenCalledOnce()
	})

	it("fully hides the stable PPT surface when its viewer area has no size", () => {
		mockState.tab.fileData = {
			file_id: "hidden-ppt-folder",
			file_name: "Hidden deck",
			file_extension: "",
			is_directory: true,
			updated_at: "2026-07-28T00:00:00Z",
			display_config: { type: "slide" },
		}

		render(<FilesViewer />)

		const portalHost = document.querySelector<HTMLElement>(
			'[data-files-viewer-ppt-portal="true"]',
		)
		expect(portalHost).toBeInTheDocument()
		expect(portalHost?.style.display).toBe("none")
		expect(portalHost?.style.visibility).toBe("hidden")
		expect(portalHost?.style.pointerEvents).toBe("none")
	})

	it("keeps the stable PPT surface hidden with its retained detail panel", () => {
		mockState.tab.fileData = {
			file_id: "retained-ppt-folder",
			file_name: "Retained deck",
			file_extension: "",
			is_directory: true,
			updated_at: "2026-07-28T00:00:00Z",
			display_config: { type: "slide" },
		}
		const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
		const getBoundingClientRectSpy = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function (this: HTMLElement) {
				if (this.dataset.filesViewerPptAnchor === "true") {
					return {
						top: 44,
						left: 120,
						right: 1080,
						bottom: 584,
						width: 960,
						height: 540,
						x: 120,
						y: 44,
						toJSON: () => ({}),
					} as DOMRect
				}
				return originalGetBoundingClientRect.call(this)
			})
		restoreBoundingClientRect = () => getBoundingClientRectSpy.mockRestore()

		render(
			<div aria-hidden="true" style={{ opacity: 0 }}>
				<FilesViewer />
			</div>,
		)

		const portalHost = document.querySelector<HTMLElement>(
			'[data-files-viewer-ppt-portal="true"]',
		)
		expect(portalHost?.style.display).toBe("none")
		expect(portalHost?.style.pointerEvents).toBe("none")
	})
})
