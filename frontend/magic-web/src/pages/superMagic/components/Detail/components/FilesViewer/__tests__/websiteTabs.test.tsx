import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	buildCustomWebsitePreset,
	buildWebsiteTab,
	isWebsiteTab,
	WEBSITE_TAB_PREFIX,
	WEBSITE_PRESETS,
} from "../utils/websiteTabs"
import WebsiteIframeTabContent from "../components/WebsiteIframeTabContent"
import WebsitePresetMenu from "../components/WebsitePresetMenu"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("antd", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => children,
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
		<button onClick={onClick} {...props}>
			{children}
		</button>
	),
	DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("website tabs", () => {
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
					url: "https://image.baidu.com/",
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

	it("identifies website tabs only by the website tab id prefix", () => {
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

		expect(isWebsiteTab({ id: `${WEBSITE_TAB_PREFIX}example` })).toBe(true)
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

	it("renders downloaded website icons for material discovery presets", () => {
		const onOpenWebsiteTab = vi.fn()
		render(<WebsitePresetMenu onOpenWebsiteTab={onOpenWebsiteTab} />)

		expect(screen.getByTestId("website-preset-icon-baidu-images")).toHaveAttribute(
			"src",
			expect.stringContaining("baidu-images.png"),
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
