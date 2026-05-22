import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mockStore = vi.hoisted(() => ({
	platforms: ["rednote"],
	resolvedPlatform: "rednote",
	rootLoading: false,
	allPosts: [
		{
			platform: "rednote",
			index: 0,
			entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
			post: {
				meta: {
					id: "post-1",
					title: "Post One",
					feedTitle: "Post One Feed",
					author: "Magic Lab",
				},
				cards: [],
			},
		},
	],
	posts: [
		{
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
				author: "Magic Lab",
			},
			cards: [],
		},
	],
	handleChangePlatform: vi.fn(),
	openPostDetail: vi.fn(),
	goHomeList: vi.fn(),
}))

vi.mock("react-dom", async () => {
	const actual = await vi.importActual<typeof import("react-dom")>("react-dom")
	return {
		...actual,
		createPortal: (node: React.ReactNode) => node,
	}
})

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			(
				({
					"detail.selfMedia.platform.switcher.label": "Platform",
					"detail.selfMedia.platform.actions.create": "New article",
					"detail.selfMedia.platform.actions.back": "Back to content",
					"detail.selfMedia.home.title": "Article home",
					"detail.selfMedia.home.subtitle": "Manage articles",
					"detail.selfMedia.home.create": "New article",
					"detail.selfMedia.home.emptyTitle": "No articles yet",
					"detail.selfMedia.home.emptyDesc": "Create your first article",
					"detail.selfMedia.home.articleCount": "1 article",
					"detail.selfMedia.home.brandConfig": "Brand config",
					"detail.selfMedia.initPanel.platforms.rednote": "RedNote",
					"detail.selfMedia.initPanel.platforms.instagram": "Instagram",
				}) as Record<string, string>
			)[key] ?? key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("@/components/base/MagicSpin", () => ({
	default: function MockMagicSpin() {
		return <div>loading</div>
	},
}))

vi.mock("antd", () => ({
	Flex: function MockFlex({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
		return <div {...props}>{children}</div>
	},
}))

vi.mock("../components/PlatformSwitcher", () => ({
	default: function MockPlatformSwitcher() {
		return <div data-testid="self-media-platform-switcher">platform-switcher</div>
	},
}))

vi.mock("../components/UnsupportedPlatform", () => ({
	default: function MockUnsupportedPlatform() {
		return <div>unsupported-platform</div>
	},
}))

vi.mock("../components/SelfMediaInitPanel", () => ({
	default: function MockSelfMediaInitPanel({ onBackHome }: { onBackHome?: () => void }) {
		return (
			<div data-testid="mock-self-media-init-panel">
				init-panel
				<button type="button" onClick={onBackHome}>
					Back to content
				</button>
			</div>
		)
	},
}))

vi.mock("../components/BrandConfigDialog", () => ({
	default: function MockBrandConfigDialog({
		open,
	}: {
		open: boolean
		onOpenChange: (open: boolean) => void
	}) {
		return open ? <div data-testid="self-media-brand-config-dialog">brand-config</div> : null
	},
}))

vi.mock("../platforms", () => ({
	getPlatformComponent: () =>
		function MockPlatformComponent() {
			return <div data-testid="mock-platform-component">platform-content</div>
		},
}))

vi.mock("../stores", () => ({
	SelfMediaStoreProvider: function MockSelfMediaStoreProvider({
		children,
	}: {
		children: React.ReactNode
	}) {
		return <>{children}</>
	},
	useSelfMediaStore: () => mockStore,
}))

vi.mock("../context/PlatformChromeContext", () => ({
	SelfMediaPlatformChromeProvider: function MockPlatformChromeProvider({
		children,
	}: {
		children: React.ReactNode
	}) {
		return <>{children}</>
	},
	useSelfMediaPlatformChrome: () => ({
		hostElement: document.createElement("div"),
	}),
}))

import SelfMediaRootRender from "../index"
import type { SelfMediaRootRenderProps } from "../types"

const ROOT_DATA = {
	file_id: "folder-1",
	file_name: "self-media",
} as SelfMediaRootRenderProps["data"]

const GENERATED_ATTACHMENT_LIST = [
	{
		file_id: "file-1",
	},
] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

describe("SelfMediaRootRender", () => {
	beforeEach(() => {
		mockStore.platforms = ["rednote"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.rootLoading = false
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
				post: {
					meta: {
						id: "post-1",
						title: "Post One",
						feedTitle: "Post One Feed",
						author: "Magic Lab",
					},
					cards: [],
				},
			},
		]
		mockStore.posts = [
			{
				meta: {
					id: "post-1",
					title: "Post One",
					feedTitle: "Post One Feed",
					author: "Magic Lab",
				},
				cards: [],
			},
		]
		mockStore.handleChangePlatform.mockReset()
		mockStore.openPostDetail.mockReset()
		mockStore.goHomeList.mockReset()
	})

	it("shows the article home before opening platform detail", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("self-media-home-page")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-platform-component")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-platform-switcher")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-home-post-open-post-1"))

		expect(mockStore.handleChangePlatform).toHaveBeenCalledWith("rednote")
		expect(mockStore.openPostDetail).toHaveBeenCalledWith(0)
		expect(screen.getByTestId("mock-platform-component")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-page")).not.toBeInTheDocument()
	})

	it("shows articles from every platform on the article home", () => {
		mockStore.platforms = ["rednote", "instagram"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "rednote-1", name: "Rednote One", entry: "posts/rednote-1/post.json" },
				post: {
					meta: { id: "rednote-1", title: "Rednote One", feedTitle: "Rednote One" },
					cards: [],
				},
			},
			{
				platform: "instagram",
				index: 0,
				entry: {
					id: "instagram-1",
					name: "Instagram One",
					entry: "posts/instagram-1/post.json",
				},
				post: {
					meta: {
						id: "instagram-1",
						title: "Instagram One",
						feedTitle: "Instagram One",
					},
					cards: [],
				},
			},
		]

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("self-media-home-platform-group-rednote")).toHaveTextContent(
			"RedNote",
		)
		expect(screen.getByTestId("self-media-home-platform-group-instagram")).toHaveTextContent(
			"Instagram",
		)
		expect(screen.getByTestId("self-media-home-post-open-rednote-1")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-home-post-open-instagram-1")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-home-post-open-instagram-1"))

		expect(mockStore.handleChangePlatform).toHaveBeenCalledWith("instagram")
		expect(mockStore.openPostDetail).toHaveBeenCalledWith(0)
	})

	it("uses platform-specific article previews on the article home", () => {
		mockStore.platforms = ["wechat-official-accounts", "rednote"]
		mockStore.resolvedPlatform = "wechat-official-accounts"
		mockStore.allPosts = [
			{
				platform: "wechat-official-accounts",
				index: 0,
				entry: { id: "wechat-1", name: "Wechat One", entry: "posts/wechat-1/post.json" },
				post: {
					meta: { id: "wechat-1", title: "Wechat One", feedTitle: "Wechat One" },
					cards: [],
					thumbnailCover: {
						path: "covers/wechat-thumb.png",
						url: "https://example.test/wechat-thumb.png",
					},
				},
			},
			{
				platform: "rednote",
				index: 0,
				entry: { id: "rednote-1", name: "Rednote One", entry: "posts/rednote-1/post.json" },
				post: {
					meta: { id: "rednote-1", title: "Rednote One", feedTitle: "Rednote One" },
					cards: [
						{
							path: "cards/card-1.html",
							url: "https://example.test/card-1.html",
						},
					],
				},
			},
		]

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("self-media-home-cover-preview-wechat-1")).toHaveAttribute(
			"src",
			"https://example.test/wechat-thumb.png",
		)
		expect(screen.getByTestId("self-media-home-card-preview-rednote-1")).toHaveAttribute(
			"src",
			"https://example.test/card-1.html",
		)
		expect(
			screen.queryByTestId("self-media-home-icon-fallback-wechat-1"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-icon-fallback-rednote-1"),
		).not.toBeInTheDocument()
	})

	it("opens brand config from the article home", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-brand-config-button"))

		expect(screen.getByTestId("self-media-brand-config-dialog")).toBeInTheDocument()
	})

	it("does not render the create article action in the platform header", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-open-post-1"))

		expect(screen.queryByTestId("self-media-create-article")).not.toBeInTheDocument()
	})

	it("opens the init panel from the article home and can go back", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-create-button"))

		expect(screen.getByTestId("mock-self-media-init-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-page")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "Back to content" }))

		expect(screen.getByTestId("self-media-home-page")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-self-media-init-panel")).not.toBeInTheDocument()
	})

	it("keeps the init panel mounted when generated posts arrive", () => {
		mockStore.platforms = []
		mockStore.resolvedPlatform = null
		mockStore.posts = []

		const { rerender } = render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("mock-self-media-init-panel")).toBeInTheDocument()

		mockStore.platforms = ["rednote"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.posts = [
			{
				meta: { id: "post-1", title: "Post One", feedTitle: "Post One Feed" },
				cards: [],
			},
		]

		rerender(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={GENERATED_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByTestId("mock-self-media-init-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-page")).not.toBeInTheDocument()
	})
})
