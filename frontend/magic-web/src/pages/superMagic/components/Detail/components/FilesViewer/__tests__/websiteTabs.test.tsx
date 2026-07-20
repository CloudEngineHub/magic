import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import magicToast from "@/components/base/MagicToaster/utils"
import {
	buildCustomWebsitePreset,
	buildWebsiteTab,
	COMMON_WEBSITE_PRESETS_LIMIT,
	getCommonWebsitePresets,
	isWebsiteTab,
	removeCommonWebsitePreset,
	saveCommonWebsitePreset,
	updateCommonWebsitePreset,
	WEBSITE_TAB_PREFIX,
	WEBSITE_PRESETS,
} from "../utils/websiteTabs"
import { getFileViewerTabType } from "../utils/tabType"
import WebsiteIframeTabContent from "../components/WebsiteIframeTabContent"
import WebsitePresetMenu from "../components/WebsitePresetMenu"
import CommonWebsitePresetDialog from "../components/CommonWebsitePresetDialog"
import { useTabContextMenu } from "../hooks/useTabContextMenu"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("antd", () => ({
	Flex: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
		<div {...props}>{children}</div>
	),
	Tooltip: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		warning: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}))

vi.mock("@/components/shadcn-ui/context-menu", () => ({
	ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ContextMenuItem: ({
		children,
		onClick,
		onSelect,
		...props
	}: {
		children: React.ReactNode
		onClick?: (event: React.MouseEvent) => void
		onSelect?: () => void
		[key: string]: unknown
	}) => (
		<button
			type="button"
			onClick={(event) => {
				onClick?.(event)
				onSelect?.()
			}}
			{...props}
		>
			{children}
		</button>
	),
	ContextMenuSeparator: () => <hr />,
	ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/dialog", () => ({
	Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
		open ? <div>{children}</div> : null,
	DialogContent: ({
		children,
		...props
	}: {
		children: React.ReactNode
		[key: string]: unknown
	}) => (
		<div role="dialog" {...props}>
			{children}
		</div>
	),
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({
		children,
		...props
	}: {
		children: React.ReactNode
		[key: string]: unknown
	}) => (
		<div data-testid="website-preset-menu" {...props}>
			{children}
		</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
		...props
	}: {
		children: React.ReactNode
		onClick?: () => void
		[key: string]: unknown
	}) => (
		<div
			role="button"
			tabIndex={0}
			onPointerDownCapture={(event) => {
				if (event.target !== event.currentTarget) onClick?.()
			}}
			onClick={onClick}
			{...props}
		>
			{children}
		</div>
	),
	DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("website tabs", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.localStorage.clear()
	})

	it("normalizes custom website urls into stable presets", () => {
		const preset = buildCustomWebsitePreset("example.com/prompts")

		expect(preset).toMatchObject({
			id: "custom-example-com-prompts",
			title: "example.com",
			url: "https://example.com/prompts",
			description: "Custom website",
		})
	})

	it("upgrades custom remote http urls to https to avoid mixed-content iframe blocking", () => {
		const preset = buildCustomWebsitePreset("http://example.com/prompts")

		expect(preset?.url).toBe("https://example.com/prompts")
	})

	it("includes curated prompt and material discovery website presets with translation keys", () => {
		expect(WEBSITE_PRESETS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "letsmagic-nano-banana-pro-prompts",
					titleKey: "fileViewer.website.presets.nanoBananaPro.title",
					icon: "nano-banana-pro",
					url: "https://www.letsmagic.cn/nano-banana-pro-prompts",
				}),
				expect.objectContaining({
					id: "letsmagic-gpt-image-2-prompts",
					titleKey: "fileViewer.website.presets.gptImage2.title",
					icon: "gpt-image-2",
					url: "https://www.letsmagic.cn/gpt-image-2-prompts",
				}),
				expect.objectContaining({
					id: "baidu-images",
					titleKey: "fileViewer.website.presets.baiduImages.title",
					descriptionKey: "fileViewer.website.presets.baiduImages.description",
					iconSrc: expect.stringContaining("baidu-images.png"),
					url: expect.stringContaining("https://image.baidu.com/search/index"),
				}),
				expect.objectContaining({
					id: "bing-images",
					titleKey: "fileViewer.website.presets.bingImages.title",
					descriptionKey: "fileViewer.website.presets.bingImages.description",
					iconSrc: expect.stringMatching(/^data:image\/svg\+xml/),
					url: "https://www.bing.com/images/search",
				}),
				expect.objectContaining({
					id: "xiaohongshu",
					titleKey: "fileViewer.website.presets.xiaohongshu.title",
					iconSrc: expect.stringContaining("xiaohongshu.png"),
					url: "https://www.xiaohongshu.com/",
				}),
				expect.objectContaining({
					id: "zcool",
					titleKey: "fileViewer.website.presets.zcool.title",
					iconSrc: expect.stringContaining("zcool.png"),
					url: "https://www.zcool.com.cn/",
				}),
				expect.objectContaining({
					id: "pexels",
					titleKey: "fileViewer.website.presets.pexels.title",
					iconSrc: expect.stringContaining("pexels.png"),
					url: "https://www.pexels.com/",
				}),
			]),
		)

		const presetIds = WEBSITE_PRESETS.map((preset) => preset.id)
		expect(presetIds).not.toContain("douyin")
		expect(presetIds).not.toContain("pixabay")
		expect(presetIds).not.toContain("google-images")
		expect(presetIds).not.toContain("magnific")
		expect(presetIds).not.toContain("unsplash")
		expect(presetIds).not.toContain("freepik")
	})

	it("builds a stable persisted tab for a website preset", () => {
		const tab = buildWebsiteTab({
			id: "image-search",
			title: "Image Search",
			url: "https://example.com/images",
			description: "Find images",
		})

		expect(tab.id).toBe(`${WEBSITE_TAB_PREFIX}image-search`)
		expect(tab.type).toBe("website")
		expect(tab.title).toBe("Image Search")
		expect(tab.fileData.file_id).toBe(tab.id)
		expect(tab.fileData.url).toBe("https://example.com/images")
		expect(tab.fileData.display_config?.type).toBe("website")
		expect(tab.fileData.display_config?.previewPolicy).toMatchObject({
			persistTab: true,
			syncWithAttachments: false,
			restoreAsActive: true,
		})
	})

	it("identifies website tabs by tab type while keeping id-prefix fallback", () => {
		expect(
			isWebsiteTab({
				id: "file:website-preview",
				fileData: {
					file_id: "file:website-preview",
					file_name: "Website Preview",
					display_config: {
						type: "website",
					},
				},
			}),
		).toBe(false)

		expect(isWebsiteTab({ id: "file:website-preview", type: "website" })).toBe(true)
		expect(isWebsiteTab({ id: `${WEBSITE_TAB_PREFIX}example` })).toBe(true)
	})

	it("resolves tab type from explicit type with id-prefix fallbacks", () => {
		expect(getFileViewerTabType({ id: "file-1", type: "file" })).toBe("file")
		expect(getFileViewerTabType({ id: "file-2", type: "website" })).toBe("website")
		expect(getFileViewerTabType({ id: `${WEBSITE_TAB_PREFIX}legacy` })).toBe("website")
		expect(getFileViewerTabType({ id: "__kb__doc" })).toBe("knowledge_base")
		expect(getFileViewerTabType({ id: "__playback__" })).toBe("playback")
	})

	it("reports existing common website presets without overwriting them", () => {
		expect(
			saveCommonWebsitePreset({
				title: "Example Images",
				url: "example.com/images",
				description: "Saved from tab",
			}),
		).toMatchObject({ status: "saved" })
		expect(
			saveCommonWebsitePreset({
				title: "Example Images Updated",
				url: "https://example.com/images",
				description: "Updated from tab",
			}),
		).toMatchObject({ status: "exists" })

		expect(getCommonWebsitePresets()).toEqual([
			expect.objectContaining({
				id: "common-example-com-images",
				title: "Example Images",
				url: "https://example.com/images",
				description: "Saved from tab",
			}),
		])
	})

	it("keeps at most 20 common website presets and reports limit overflow", () => {
		Array.from({ length: COMMON_WEBSITE_PRESETS_LIMIT }, (_, index) => {
			expect(
				saveCommonWebsitePreset({
					title: `Saved ${index}`,
					url: `https://example.com/images/${index}`,
				}),
			).toMatchObject({ status: "saved" })
		})

		expect(
			saveCommonWebsitePreset({
				title: "Overflow",
				url: "https://example.com/images/overflow",
			}),
		).toMatchObject({ status: "limit" })

		const presets = getCommonWebsitePresets()
		expect(presets).toHaveLength(COMMON_WEBSITE_PRESETS_LIMIT)
		expect(presets.some((preset) => preset.title === "Overflow")).toBe(false)
	})

	it("removes common website presets from local storage", () => {
		const result = saveCommonWebsitePreset({
			title: "Example Images",
			url: "example.com/images",
			description: "Saved from tab",
		})
		expect(result.status).toBe("saved")
		if (result.status !== "saved") return

		expect(removeCommonWebsitePreset(result.preset.id)).toBe(true)
		expect(getCommonWebsitePresets()).toEqual([])
	})

	it("updates common website preset title and link", () => {
		const result = saveCommonWebsitePreset({
			title: "Example Images",
			url: "example.com/images",
			description: "Saved from tab",
		})
		expect(result.status).toBe("saved")
		if (result.status !== "saved") return

		expect(
			updateCommonWebsitePreset(result.preset.id, {
				title: "Edited Images",
				url: "https://example.com/edited",
				description: "Edited from menu",
			}),
		).toMatchObject({ status: "saved" })

		expect(getCommonWebsitePresets()).toEqual([
			expect.objectContaining({
				id: "common-example-com-edited",
				title: "Edited Images",
				url: "https://example.com/edited",
				description: "Edited from menu",
			}),
		])
	})

	it("reports existing common website when editing to another saved link", () => {
		const firstResult = saveCommonWebsitePreset({
			title: "First Images",
			url: "https://example.com/first",
		})
		const secondResult = saveCommonWebsitePreset({
			title: "Second Images",
			url: "https://example.com/second",
		})
		expect(firstResult.status).toBe("saved")
		expect(secondResult.status).toBe("saved")
		if (firstResult.status !== "saved" || secondResult.status !== "saved") return

		expect(
			updateCommonWebsitePreset(secondResult.preset.id, {
				title: "Edited Second",
				url: "https://example.com/first",
			}),
		).toMatchObject({ status: "exists" })

		expect(getCommonWebsitePresets()).toEqual([
			expect.objectContaining({ title: "Second Images", url: "https://example.com/second" }),
			expect.objectContaining({ title: "First Images", url: "https://example.com/first" }),
		])
	})

	it("submits edited title and link from the common website dialog", () => {
		const onSubmit = vi.fn()
		render(
			<CommonWebsitePresetDialog
				open
				mode="add"
				initialValues={{
					title: "Saved Image Board",
					url: "https://example.com/saved-images",
					description: "Saved from tab",
				}}
				onOpenChange={vi.fn()}
				onSubmit={onSubmit}
			/>,
		)

		fireEvent.change(screen.getByLabelText("fileViewer.website.commonTitleLabel"), {
			target: { value: "Edited Board" },
		})
		fireEvent.change(screen.getByLabelText("fileViewer.website.commonUrlLabel"), {
			target: { value: "https://example.com/edited-board" },
		})
		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.commonConfirm" }))

		expect(onSubmit).toHaveBeenCalledWith({
			title: "Edited Board",
			url: "https://example.com/edited-board",
			description: "Saved from tab",
		})
	})

	it("adds a common-website action only for website tab context menus", () => {
		const addWebsiteToCommon = vi.fn()
		const websiteTab = buildWebsiteTab({
			id: "example-images",
			title: "Example Images",
			url: "https://example.com/images",
			description: "Saved from tab",
		})
		const fileTab = {
			id: "file-1",
			title: "File",
			type: "file" as const,
			active: true,
			closeable: true,
			fileData: {
				file_id: "file-1",
				file_name: "file.txt",
			},
		}
		const actions = {
			closeFileTab: vi.fn(),
			closeOtherTabs: vi.fn(),
			closeTabsToRight: vi.fn(),
			clearAllTabs: vi.fn(),
			refreshTab: vi.fn(),
			addWebsiteToCommon,
		}
		const { result } = renderHook(() =>
			useTabContextMenu({
				tabs: [websiteTab, fileTab],
				actions,
			}),
		)

		const websiteItems = result.current.getContextMenuItems(websiteTab.id) || []
		const fileItems = result.current.getContextMenuItems(fileTab.id) || []

		const commonItem = websiteItems.find((item) => item?.key === "addWebsiteToCommon")
		expect(commonItem).toMatchObject({
			key: "addWebsiteToCommon",
			label: "fileViewer.tabs.addWebsiteToCommon",
		})
		expect(fileItems.some((item) => item?.key === "addWebsiteToCommon")).toBe(false)

		act(() => {
			if (commonItem && "onClick" in commonItem && commonItem.onClick) {
				commonItem.onClick({} as never)
			}
		})

		expect(addWebsiteToCommon).toHaveBeenCalledWith(websiteTab)
	})

	it("disables close actions that cannot remove protected tabs", () => {
		const protectedTab = {
			id: "index",
			title: "index.html",
			type: "file" as const,
			active: true,
			closeable: false,
			fileData: { file_id: "index", file_name: "index.html" },
		}
		const actions = {
			closeFileTab: vi.fn(),
			closeOtherTabs: vi.fn(),
			closeTabsToRight: vi.fn(),
			clearAllTabs: vi.fn(),
			refreshTab: vi.fn(),
		}
		const { result } = renderHook(() => useTabContextMenu({ tabs: [protectedTab], actions }))
		const items = result.current.getContextMenuItems(protectedTab.id) || []

		expect(items.find((item) => item?.key === "close")).toMatchObject({ disabled: true })
		expect(items.find((item) => item?.key === "closeOthers")).toMatchObject({
			disabled: true,
		})
		expect(items.find((item) => item?.key === "closeToRight")).toMatchObject({
			disabled: true,
		})
		expect(items.find((item) => item?.key === "closeAll")).toMatchObject({
			disabled: true,
		})
	})

	it("renders website tabs through an iframe with an external-open fallback", () => {
		render(
			<WebsiteIframeTabContent
				title="Image Search"
				url="https://example.com/images"
				description="Find images"
			/>,
		)

		const frame = screen.getByTitle("Image Search")
		expect(frame).toHaveAttribute("src", "https://example.com/images")
		expect(frame).toHaveAttribute("referrerPolicy", "no-referrer")
		expect(frame).toHaveAttribute(
			"sandbox",
			"allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation",
		)
		expect(
			screen.getByRole("link", { name: /fileViewer.website.openExternal/ }),
		).toHaveAttribute("href", "https://example.com/images")
		expect(screen.getByRole("link", { name: /fileViewer.website.openExternal/ })).toHaveClass(
			"hover:text-accent-foreground",
		)
	})

	it("grants common website iframe capabilities including clipboard access", () => {
		render(
			<WebsiteIframeTabContent
				title="Prompt Site"
				url="https://example.com/prompts"
				description="Copyable prompts"
			/>,
		)

		const frame = screen.getByTitle("Prompt Site")
		expect(frame).toHaveAttribute(
			"allow",
			"clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media; picture-in-picture; web-share",
		)
		expect(frame).toHaveAttribute(
			"sandbox",
			"allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation",
		)
		expect(frame).toHaveAttribute("allowFullScreen")
	})

	it("refreshes the current website iframe from the header action", () => {
		render(
			<WebsiteIframeTabContent
				title="Prompt Site"
				url="https://example.com/prompts"
				description="Copyable prompts"
			/>,
		)

		const frame = screen.getByTitle("Prompt Site")

		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.refresh" }))

		expect(screen.getByTitle("Prompt Site")).not.toBe(frame)
		expect(screen.getByTitle("Prompt Site")).toHaveAttribute(
			"src",
			"https://example.com/prompts",
		)
	})

	it("shows an external-open fallback when the website iframe does not finish loading", () => {
		vi.useFakeTimers()

		try {
			render(
				<WebsiteIframeTabContent
					title="Blocked Site"
					url="https://example.com/blocked"
					description="May reject iframe embedding"
				/>,
			)

			expect(
				screen.queryByText("fileViewer.website.loadFallbackTitle"),
			).not.toBeInTheDocument()

			act(() => {
				vi.advanceTimersByTime(8000)
			})

			expect(screen.getByText("fileViewer.website.loadFallbackTitle")).toBeInTheDocument()
			expect(
				screen
					.getAllByRole("link", { name: /fileViewer.website.openExternal/ })
					.some((link) => link.getAttribute("href") === "https://example.com/blocked"),
			).toBe(true)
		} finally {
			vi.useRealTimers()
		}
	})

	it("keeps the delayed website fallback from covering a partially visible iframe", () => {
		vi.useFakeTimers()

		try {
			render(
				<WebsiteIframeTabContent
					title="Slow Site"
					url="https://example.com/slow"
					description="May paint before the iframe load event"
				/>,
			)

			act(() => {
				vi.advanceTimersByTime(8000)
			})

			const fallback = screen
				.getByText("fileViewer.website.loadFallbackTitle")
				.closest("[data-testid='website-load-fallback']")
			expect(fallback).toHaveClass("bottom-4")
			expect(fallback).not.toHaveClass("inset-0")
		} finally {
			vi.useRealTimers()
		}
	})

	it("removes the delayed website fallback once the iframe finishes loading", () => {
		vi.useFakeTimers()

		try {
			render(
				<WebsiteIframeTabContent
					title="Eventually Loaded Site"
					url="https://example.com/eventually-loaded"
					description="Loads after the fallback appears"
				/>,
			)

			act(() => {
				vi.advanceTimersByTime(8000)
			})

			expect(screen.getByTestId("website-load-fallback")).toBeInTheDocument()

			fireEvent.load(screen.getByTitle("Eventually Loaded Site"))

			expect(screen.queryByTestId("website-load-fallback")).not.toBeInTheDocument()
		} finally {
			vi.useRealTimers()
		}
	})

	it("lets users dismiss the delayed website fallback", () => {
		vi.useFakeTimers()

		try {
			render(
				<WebsiteIframeTabContent
					title="Dismissable Slow Site"
					url="https://example.com/dismissable"
					description="May load slowly"
				/>,
			)

			act(() => {
				vi.advanceTimersByTime(8000)
			})

			expect(screen.getByTestId("website-load-fallback")).toBeInTheDocument()

			fireEvent.click(
				screen.getByRole("button", { name: "fileViewer.website.closeLoadFallback" }),
			)

			expect(screen.queryByTestId("website-load-fallback")).not.toBeInTheDocument()
		} finally {
			vi.useRealTimers()
		}
	})

	it("opens the selected preset from the add menu", () => {
		const onOpenWebsiteTab = vi.fn()
		const { container } = render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		const addButton = screen.getByRole("button", { name: "fileViewer.website.add" })
		expect(addButton.querySelector("svg")).toBeInTheDocument()
		expect(container.querySelector(".lucide-plus")).toBeInTheDocument()

		fireEvent.click(
			screen.getByRole("button", {
				name: "fileViewer.website.presets.nanoBananaPro.title",
			}),
		)

		expect(onOpenWebsiteTab).toHaveBeenCalledWith({
			...WEBSITE_PRESETS[0],
			title: "fileViewer.website.presets.nanoBananaPro.title",
			description: "fileViewer.website.presets.nanoBananaPro.description",
		})
	})

	it("renders model icons for the LetsMagic prompt website presets", () => {
		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		expect(screen.getByTestId("website-preset-icon-nano-banana-pro")).toBeInTheDocument()
		expect(screen.getByTestId("website-preset-icon-gpt-image-2")).toBeInTheDocument()
	})

	it("renders website icons for material discovery presets", () => {
		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		expect(screen.getByTestId("website-preset-icon-baidu-images")).toHaveAttribute(
			"src",
			expect.stringContaining("baidu-images.png"),
		)
		expect(screen.getByTestId("website-preset-icon-bing-images")).toHaveAttribute(
			"src",
			expect.stringMatching(/^data:image\/svg\+xml/),
		)
		expect(screen.getByTestId("website-preset-icon-xiaohongshu")).toHaveAttribute(
			"src",
			expect.stringContaining("xiaohongshu.png"),
		)
		expect(screen.getByTestId("website-preset-icon-zcool")).toHaveAttribute(
			"src",
			expect.stringContaining("zcool.png"),
		)
		expect(screen.getByTestId("website-preset-icon-pexels")).toHaveAttribute(
			"src",
			expect.stringContaining("pexels.png"),
		)
	})

	it("opens a custom website from the add menu", () => {
		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		fireEvent.change(screen.getByPlaceholderText("fileViewer.website.customPlaceholder"), {
			target: { value: "example.com/prompts" },
		})
		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.openCustom" }))

		expect(onOpenWebsiteTab).toHaveBeenCalledWith({
			id: "custom-example-com-prompts",
			title: "example.com",
			url: "https://example.com/prompts",
			description: "fileViewer.website.customDescription",
		})
	})

	it("renders saved common websites at the bottom of the website menu", () => {
		saveCommonWebsitePreset({
			title: "Saved Image Board",
			url: "https://example.com/saved-images",
			description: "Saved from tab",
		})

		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		expect(screen.getByText("fileViewer.website.commonTitle")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "Saved Image Board" }))

		expect(onOpenWebsiteTab).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "common-example-com-saved-images",
				title: "Saved Image Board",
				url: "https://example.com/saved-images",
				description: "Saved from tab",
			}),
		)
	})

	it("edits saved common websites from the website menu context actions", () => {
		saveCommonWebsitePreset({
			title: "Saved Image Board",
			url: "https://example.com/saved-images",
			description: "Saved from tab",
		})

		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.editCommon" }))
		fireEvent.change(screen.getByLabelText("fileViewer.website.commonTitleLabel"), {
			target: { value: "Edited Image Board" },
		})
		fireEvent.change(screen.getByLabelText("fileViewer.website.commonUrlLabel"), {
			target: { value: "https://example.com/edited-images" },
		})
		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.commonConfirm" }))

		expect(onOpenWebsiteTab).not.toHaveBeenCalled()
		expect(screen.getByRole("button", { name: "Edited Image Board" })).toBeInTheDocument()
		expect(getCommonWebsitePresets()).toEqual([
			expect.objectContaining({
				title: "Edited Image Board",
				url: "https://example.com/edited-images",
			}),
		])
	})

	it("warns when editing a common website to an existing link", () => {
		saveCommonWebsitePreset({
			title: "First Images",
			url: "https://example.com/first",
		})
		saveCommonWebsitePreset({
			title: "Second Images",
			url: "https://example.com/second",
		})

		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		fireEvent.click(screen.getAllByRole("button", { name: "fileViewer.website.editCommon" })[0])
		fireEvent.change(screen.getByLabelText("fileViewer.website.commonUrlLabel"), {
			target: { value: "https://example.com/first" },
		})
		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.commonConfirm" }))

		expect(magicToast.warning).toHaveBeenCalledWith("fileViewer.website.commonAlreadyExists")
		expect(getCommonWebsitePresets()).toEqual([
			expect.objectContaining({ title: "Second Images", url: "https://example.com/second" }),
			expect.objectContaining({ title: "First Images", url: "https://example.com/first" }),
		])
		expect(
			screen.getByRole("button", { name: "fileViewer.website.commonConfirm" }),
		).toBeInTheDocument()
	})

	it("deletes saved common websites from the website menu context actions", () => {
		saveCommonWebsitePreset({
			title: "Saved Image Board",
			url: "https://example.com/saved-images",
			description: "Saved from tab",
		})

		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		fireEvent.click(screen.getByRole("button", { name: "fileViewer.website.deleteCommon" }))

		expect(onOpenWebsiteTab).not.toHaveBeenCalled()
		expect(screen.queryByRole("button", { name: "Saved Image Board" })).not.toBeInTheDocument()
		expect(getCommonWebsitePresets()).toEqual([])
	})

	it("removes saved common websites from the visible close button without opening the link", () => {
		saveCommonWebsitePreset({
			title: "Saved Image Board",
			url: "https://example.com/saved-images",
			description: "Saved from tab",
		})

		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		fireEvent.pointerDown(
			screen.getByRole("button", {
				name: "fileViewer.website.removeCommon Saved Image Board",
			}),
		)
		fireEvent.click(
			screen.getByRole("button", {
				name: "fileViewer.website.removeCommon Saved Image Board",
			}),
		)

		expect(onOpenWebsiteTab).not.toHaveBeenCalled()
		expect(screen.queryByRole("button", { name: "Saved Image Board" })).not.toBeInTheDocument()
		expect(getCommonWebsitePresets()).toEqual([])
	})

	it("keeps the menu header and custom url input sticky above a scrollable preset list", () => {
		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		const menu = screen.getByTestId("website-preset-menu")
		const header = screen.getByTestId("website-preset-menu-header")
		const list = screen.getByTestId("website-preset-list")

		expect(menu).toHaveClass("overflow-hidden")
		expect(header).toHaveClass("sticky")
		expect(header).toHaveClass("top-0")
		expect(list).toHaveClass("overflow-y-auto")
	})
})
