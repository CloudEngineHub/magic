import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mockSendSelfMediaPrePublishAnalysis = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockLanguageModel = vi.hoisted(() => ({
	id: "model-1",
	group_id: "group-1",
	model_id: "gpt-5",
	model_name: "GPT-5",
	provider_model_id: "gpt-5",
	model_description: "",
	model_icon: "",
	model_status: "normal",
	sort: 1,
}))

const mockStore = vi.hoisted(() => ({
	platforms: ["rednote"],
	resolvedPlatform: "rednote",
	rootLoading: false,
	activePostIndex: 0,
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
	ensurePlatformPostLoaded: vi.fn(),
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

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: mockToastError,
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

vi.mock("../components/CardFrame", () => ({
	default: function MockCardFrame({ fileId, version }: { fileId?: string; version?: string }) {
		return <div data-file-id={fileId} data-version={version} data-testid="mock-card-frame" />
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

vi.mock("../components/AICardCreateDialog", () => ({
	default: function MockAICardCreateDialog({ open }: { open: boolean }) {
		return open ? (
			<div data-testid="self-media-ai-card-create-dialog">ai-card-create</div>
		) : null
	},
}))

vi.mock("../components/PrePublishAnalysisDialog", () => ({
	default: function MockPrePublishAnalysisDialog({
		open,
		onOpenChange,
		onConfirm,
		selectedModel,
	}: {
		open: boolean
		onOpenChange: (open: boolean) => void
		onConfirm: (
			goal: "ip-growth" | "conversion" | "viral-traffic",
			model: typeof mockLanguageModel | null,
		) => void
		selectedModel?: typeof mockLanguageModel | null
		loading?: boolean
	}) {
		return open ? (
			<div data-testid="pre-publish-analysis-dialog">
				<div data-testid="pre-publish-analysis-selected-model">
					{selectedModel?.model_name}
				</div>
				<button type="button" onClick={() => onConfirm("conversion", selectedModel ?? null)}>
					confirm-analysis
				</button>
				<button type="button" onClick={() => onOpenChange(false)}>
					cancel-analysis
				</button>
			</div>
		) : null
	},
}))

vi.mock("../platforms", () => ({
	getPlatformComponent: () =>
		function MockPlatformComponent() {
			return <div data-testid="mock-platform-component">platform-content</div>
		},
}))

vi.mock("../platforms/wechat-official-accounts/useCoverImageUrl", () => ({
	useCoverImageUrl: (fileId?: string) => ({
		url: fileId ? `https://example.test/${fileId}.png` : null,
		loading: false,
		error: null,
	}),
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

vi.mock("../services/selfMediaPrePublishAnalysis", () => ({
	SELF_MEDIA_PRE_PUBLISH_TOPIC_PATTERN: "ip-manager",
	sendSelfMediaPrePublishAnalysis: mockSendSelfMediaPrePublishAnalysis,
}))

vi.mock("@/stores/superMagic", () => ({
	topicModelStore: {
		selectedLanguageModel: mockLanguageModel,
	},
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getModelGroupsByMode: () => [
			{
				group: { id: "group-1", name: "Models" },
				models: [mockLanguageModel],
			},
		],
	},
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

const POST_DIRECTORY_ATTACHMENT_LIST = [
	{
		file_id: "root",
		file_name: "self-media",
		relative_file_path: "",
		is_directory: true,
		children: [
			{
				file_id: "post-dir",
				file_name: "post-1",
				relative_file_path: "posts/post-1/",
				is_directory: true,
				children: [
					{
						file_id: "post-json",
						file_name: "post.json",
						relative_file_path: "posts/post-1/post.json",
					},
					{
						file_id: "card-file",
						file_name: "01.html",
						relative_file_path: "posts/post-1/cards/01.html",
					},
				],
			},
		],
	},
] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

describe("SelfMediaRootRender", () => {
	beforeEach(() => {
		mockStore.platforms = ["rednote"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.rootLoading = false
		mockStore.activePostIndex = 0
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
		mockStore.ensurePlatformPostLoaded.mockReset()
		mockStore.goHomeList.mockReset()
		mockSendSelfMediaPrePublishAnalysis.mockReset()
		mockToastError.mockReset()
	})

	it("shows the article home before opening platform detail", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
				allowEdit
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
				allowEdit
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
						fileId: "wechat-thumb-file",
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
							fileId: "rednote-card-file",
							version: "v1",
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
				allowEdit
			/>,
		)

		expect(screen.getByTestId("self-media-home-cover-preview-wechat-1")).toHaveAttribute(
			"src",
			"https://example.test/wechat-thumb-file.png",
		)
		expect(screen.getByTestId("self-media-home-card-preview-rednote-1")).toContainElement(
			screen.getByTestId("mock-card-frame"),
		)
		expect(screen.getByTestId("mock-card-frame")).toHaveAttribute(
			"data-file-id",
			"rednote-card-file",
		)
		expect(screen.getByTestId("mock-card-frame")).toHaveAttribute("data-version", "v1")
		expect(
			screen.queryByTestId("self-media-home-icon-fallback-wechat-1"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-icon-fallback-rednote-1"),
		).not.toBeInTheDocument()
	})

	it("loads platform posts on the article home before preview assets are available", () => {
		mockStore.platforms = ["wechat-official-accounts", "rednote"]
		mockStore.resolvedPlatform = "rednote"
		mockStore.allPosts = [
			{
				platform: "wechat-official-accounts",
				index: 0,
				entry: { id: "wechat-1", name: "Wechat One", entry: "posts/wechat-1/post.json" },
				post: {
					meta: { id: "wechat-1", title: "Wechat One", feedTitle: "Wechat One" },
					cards: [],
				},
			},
			{
				platform: "rednote",
				index: 0,
				entry: { id: "rednote-1", name: "Rednote One", entry: "posts/rednote-1/post.json" },
				post: {
					meta: { id: "rednote-1", title: "Rednote One", feedTitle: "Rednote One" },
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
				allowEdit
			/>,
		)

		expect(mockStore.ensurePlatformPostLoaded).toHaveBeenCalledWith(
			"wechat-official-accounts",
			0,
		)
		expect(mockStore.ensurePlatformPostLoaded).toHaveBeenCalledWith("rednote", 0)
	})

	it("opens pre-publish analysis from the article home and sends with the selected goal", async () => {
		const post = {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
				author: "Magic Lab",
			},
			cards: [{ path: "cards/01.html", fileId: "card-file" }],
		}
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
				post,
			},
		]
		mockStore.ensurePlatformPostLoaded.mockResolvedValue(post)

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-analysis-post-1"))

		expect(screen.getByTestId("pre-publish-analysis-dialog")).toBeInTheDocument()
		expect(screen.getByTestId("pre-publish-analysis-selected-model")).toHaveTextContent("GPT-5")

		fireEvent.click(screen.getByText("confirm-analysis"))

		await waitFor(() => {
			expect(mockSendSelfMediaPrePublishAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					selectedProject: { id: "project-1" },
					platform: "rednote",
					analysisGoal: "conversion",
					selectedModel: mockLanguageModel,
					post,
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
						is_directory: true,
					}),
				}),
			)
		})
		expect(mockToastError).not.toHaveBeenCalled()
	})

	it("opens pre-publish analysis from the platform floating action", async () => {
		const post = {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
				author: "Magic Lab",
			},
			cards: [{ path: "cards/01.html", fileId: "card-file" }],
		}
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
				post,
			},
		]
		mockStore.ensurePlatformPostLoaded.mockResolvedValue(post)

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-open-post-1"))
		fireEvent.click(screen.getByTestId("self-media-floating-pre-publish-analysis"))
		fireEvent.click(screen.getByText("confirm-analysis"))

		await waitFor(() => {
			expect(mockSendSelfMediaPrePublishAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					selectedProject: { id: "project-1" },
					platform: "rednote",
					analysisGoal: "conversion",
					selectedModel: mockLanguageModel,
					post,
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
						is_directory: true,
					}),
				}),
			)
		})
	})

	it("does not show the home pre-publish analysis entry in read-only mode", () => {
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
				post: {
					meta: { id: "post-1", title: "Post One" },
					cards: [{ path: "cards/01.html", fileId: "card-file" }],
				},
			},
		]

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit={false}
			/>,
		)

		expect(screen.queryByTestId("self-media-home-post-analysis-post-1")).not.toBeInTheDocument()
	})

	it("does not show the platform floating pre-publish analysis entry in read-only mode", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit={false}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-open-post-1"))

		expect(
			screen.queryByTestId("self-media-floating-pre-publish-analysis"),
		).not.toBeInTheDocument()
	})

	it("shows a toast and does not send analysis when the post directory cannot be resolved", async () => {
		const post = {
			meta: { id: "post-1", title: "Post One" },
			cards: [{ path: "cards/01.html", fileId: "missing-card-file" }],
		}
		mockStore.allPosts = [
			{
				platform: "rednote",
				index: 0,
				entry: { id: "post-1", name: "Post One", entry: "posts/post-1/post.json" },
				post,
			},
		]
		mockStore.ensurePlatformPostLoaded.mockResolvedValue(post)

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-analysis-post-1"))
		fireEvent.click(screen.getByText("confirm-analysis"))

		await waitFor(() => {
			expect(mockToastError).toHaveBeenCalledWith("detail.selfMedia.analysis.startFailed")
		})
		expect(mockSendSelfMediaPrePublishAnalysis).not.toHaveBeenCalled()
	})

	it("opens brand config from the article home", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={[]}
				attachmentList={[]}
				selectedProject={{ id: "project-1" }}
				allowEdit
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
				allowEdit
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
				allowEdit
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
				allowEdit
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
				allowEdit
			/>,
		)

		expect(screen.getByTestId("mock-self-media-init-panel")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-page")).not.toBeInTheDocument()
	})
})
