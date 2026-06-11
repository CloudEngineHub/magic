import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"

const mockSendSelfMediaPrePublishAnalysis = vi.hoisted(() => vi.fn())
const mockSendSelfMediaPostPublishDataRefresh = vi.hoisted(() => vi.fn())
const mockBuildSelfMediaPostAutoSyncTaskData = vi.hoisted(() => vi.fn())
const mockSaveSelfMediaPostAutoSyncTask = vi.hoisted(() => vi.fn())
const mockDisableSelfMediaPostAutoSyncTask = vi.hoisted(() => vi.fn())
const mockToastError = vi.hoisted(() => vi.fn())
const mockLoadPostOpsSource = vi.hoisted(() => vi.fn())
const mockSavePostOpsSource = vi.hoisted(() => vi.fn())
const mockAICardCreateDialogRender = vi.hoisted(() => vi.fn())
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
		t: (key: string, options?: Record<string, unknown>) => {
			const text =
				(
					{
						"detail.selfMedia.platform.switcher.label": "Platform",
						"detail.selfMedia.platform.actions.create": "New article",
						"detail.selfMedia.platform.actions.back": "Back to content",
						"detail.selfMedia.home.title": "Article home",
						"detail.selfMedia.home.subtitle": "Manage articles",
						"detail.selfMedia.home.create": "New article",
						"detail.selfMedia.home.emptyTitle": "No articles yet",
						"detail.selfMedia.home.emptyDesc": "Create your first article",
						"detail.selfMedia.home.articleCount": "1 article",
						"detail.selfMedia.home.postReviewCard": "Create review",
						"detail.selfMedia.home.postReviewCardName": "Review: {{title}}",
						"detail.selfMedia.home.opsData": "Data",
						"detail.selfMedia.home.dataSyncNow": "Sync now",
						"detail.selfMedia.home.dataOverview": "Data overview",
						"detail.selfMedia.home.autoSync": "Auto sync",
						"detail.selfMedia.home.autoSyncDescription": "Run on a schedule",
						"detail.selfMedia.home.autoSyncStatus": "Status",
						"detail.selfMedia.home.autoSyncEnabled": "On",
						"detail.selfMedia.home.autoSyncDisabled": "Off",
						"detail.selfMedia.home.autoSyncDaily": "Daily",
						"detail.selfMedia.home.autoSyncWeekly": "Weekly",
						"detail.selfMedia.home.autoSyncMonthly": "Monthly",
						"detail.selfMedia.home.autoSyncWeekdayPlaceholder": "Weekday",
						"detail.selfMedia.home.autoSyncMonthDayPlaceholder": "Day",
						"detail.selfMedia.home.autoSyncSave": "Save auto sync",
						"detail.selfMedia.home.autoSyncTurnOff": "Turn off auto sync",
						"detail.selfMedia.analysis.action": "AI diagnosis",
						"detail.selfMedia.home.bindPublishedLink": "Connect published link",
						"detail.selfMedia.home.editPublishedLink": "Change published link",
						"detail.selfMedia.home.publishedLinkInput": "Published content link",
						"detail.selfMedia.home.publishedLinkPlaceholder":
							"Paste the published content link",
						"detail.selfMedia.home.loadingPublishedLink": "Loading link...",
						"detail.selfMedia.home.bindPublishedLinkAction": "Save link",
						"detail.selfMedia.home.bindAndFetchPublishedData":
							"Save and fetch article data",
						"detail.selfMedia.opsRefresh.missingSourceUrl":
							"Please bind the published article URL first.",
						"detail.selfMedia.home.opsOverview.title": "Operations loop",
						"detail.selfMedia.home.opsOverview.content": "Content",
						"detail.selfMedia.home.opsOverview.source": "Published link",
						"detail.selfMedia.home.opsOverview.metrics": "Metrics",
						"detail.selfMedia.home.opsOverview.comments": "Feedback",
						"detail.selfMedia.home.opsOverview.review": "Review",
						"detail.selfMedia.home.opsOverview.progress": "{{done}}/{{total}}",
						"detail.selfMedia.home.opsArtifacts.sourceReady": "Link bound",
						"detail.selfMedia.home.opsArtifacts.sourceMissing": "Link missing",
						"detail.selfMedia.home.opsArtifacts.metricsReady": "Metrics ready",
						"detail.selfMedia.home.opsArtifacts.commentsReady": "Feedback ready",
						"detail.selfMedia.home.opsArtifacts.reviewReady": "Review ready",
						"detail.selfMedia.home.opsArtifacts.metricsMissing": "Data not fetched",
						"detail.selfMedia.home.opsArtifacts.commentsMissing":
							"Feedback not organized",
						"detail.selfMedia.home.opsArtifacts.reviewMissing": "Review not created",
						"detail.selfMedia.home.referenceData": "Reference data",
						"detail.selfMedia.home.brandConfig": "Brand config",
						"detail.selfMedia.initPanel.platforms.rednote": "RedNote",
						"detail.selfMedia.initPanel.platforms.instagram": "Instagram",
					} as Record<string, string>
				)[key] ?? key
			return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				String(options?.[name] ?? ""),
			)
		},
	}),
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
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

vi.mock("../components/SelfMediaOpsMetricsDialog", () => ({
	default: function MockSelfMediaOpsMetricsDialog({
		open,
		target,
		onFetchPublishedData,
	}: {
		open: boolean
		target?: { post?: { meta?: { title?: string; feedTitle?: string } } } | null
		onFetchPublishedData?: (target: unknown, publishedUrl: string) => void
	}) {
		return open ? (
			<div data-testid="self-media-ops-metrics-dialog">
				{target?.post?.meta?.feedTitle || target?.post?.meta?.title}
				<button
					type="button"
					onClick={() =>
						target &&
						onFetchPublishedData?.(
							target,
							"https://www.xiaohongshu.com/explore/dialog-post-1",
						)
					}
					data-testid="self-media-ops-dialog-fetch"
				>
					fetch-dialog-data
				</button>
			</div>
		) : null
	},
}))

vi.mock("../components/AICardCreateDialog", () => ({
	default: function MockAICardCreateDialog({
		open,
		initialValues,
	}: {
		open: boolean
		initialValues?: {
			taskName?: string
			prompt?: string
			template?: string
			enabled?: boolean
		}
	}) {
		mockAICardCreateDialogRender({ open, initialValues })
		return open ? (
			<div data-testid="self-media-ai-card-create-dialog">
				<div data-testid="self-media-ai-card-create-task-name">
					{initialValues?.taskName}
				</div>
				<div data-testid="self-media-ai-card-create-prompt">{initialValues?.prompt}</div>
				<div data-testid="self-media-ai-card-create-template">
					{initialValues?.template}
				</div>
				<div data-testid="self-media-ai-card-create-enabled">
					{String(initialValues?.enabled)}
				</div>
			</div>
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
				<button
					type="button"
					onClick={() => onConfirm("conversion", selectedModel ?? null)}
				>
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

vi.mock("../services/selfMediaPostPublishDataRefresh", () => ({
	SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN: "ip-manager",
	sendSelfMediaPostPublishDataRefresh: mockSendSelfMediaPostPublishDataRefresh,
}))

vi.mock("../services/selfMediaPostAutoSync", () => ({
	buildSelfMediaPostAutoSyncTaskData: mockBuildSelfMediaPostAutoSyncTaskData,
	saveSelfMediaPostAutoSyncTask: mockSaveSelfMediaPostAutoSyncTask,
	disableSelfMediaPostAutoSyncTask: mockDisableSelfMediaPostAutoSyncTask,
}))

vi.mock("../services/SelfMediaFileStorageService", () => ({
	SelfMediaFileStorageService: class MockSelfMediaFileStorageService {
		loadPostOpsSource = mockLoadPostOpsSource
		savePostOpsSource = mockSavePostOpsSource
	},
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
		getModelListByMode: () => [mockLanguageModel],
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

const POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST = [
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
					{
						file_id: "source-json",
						file_name: "source.json",
						relative_file_path: "posts/post-1/ops/source.json",
					},
				],
			},
		],
	},
] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

function withMockedCardWidth(width: number, run: () => void | Promise<void>) {
	const originalResizeObserver = globalThis.ResizeObserver
	class MockResizeObserver {
		private readonly callback: ResizeObserverCallback

		constructor(callback: ResizeObserverCallback) {
			this.callback = callback
		}

		observe(target: Element) {
			this.callback(
				[
					{
						target,
						contentRect: { width },
					} as ResizeObserverEntry,
				],
				this as unknown as ResizeObserver,
			)
		}

		unobserve = vi.fn()
		disconnect = vi.fn()
	}
	vi.stubGlobal("ResizeObserver", MockResizeObserver)

	return Promise.resolve(run()).finally(() => {
		if (originalResizeObserver) {
			vi.stubGlobal("ResizeObserver", originalResizeObserver)
		} else {
			vi.unstubAllGlobals()
		}
	})
}

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
						feedLikes: "1.2w",
						commentCount: "128",
						time: "2 hours ago",
						comments: [{ name: "Alice", text: "This makes the workflow concrete." }],
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
					feedLikes: "1.2w",
					commentCount: "128",
					time: "2 hours ago",
					comments: [{ name: "Alice", text: "This makes the workflow concrete." }],
				},
				cards: [],
			},
		]
		mockStore.handleChangePlatform.mockReset()
		mockStore.openPostDetail.mockReset()
		mockStore.ensurePlatformPostLoaded.mockReset()
		mockStore.goHomeList.mockReset()
		mockSendSelfMediaPrePublishAnalysis.mockReset()
		mockSendSelfMediaPostPublishDataRefresh.mockReset()
		mockBuildSelfMediaPostAutoSyncTaskData.mockReset().mockReturnValue({
			task_name: "[文章数据同步] Post One Feed",
			workspace_id: "workspace-1",
			project_id: "project-1",
			topic_id: "",
		})
		mockSaveSelfMediaPostAutoSyncTask.mockReset().mockResolvedValue("task-1")
		mockDisableSelfMediaPostAutoSyncTask.mockReset().mockResolvedValue(undefined)
		mockLoadPostOpsSource.mockReset().mockResolvedValue(null)
		mockSavePostOpsSource.mockReset().mockResolvedValue(undefined)
		mockToastError.mockReset()
		mockAICardCreateDialogRender.mockReset()
	})

	it("shows the article home before opening platform detail", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-brand-config-button"))

		expect(screen.getByTestId("self-media-brand-config-dialog")).toBeInTheDocument()
	})

	it("opens the file-backed ops metrics dialog from an article card", async () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-data-post-1"))
		fireEvent.click(await screen.findByTestId("self-media-home-post-data-overview-post-1"))

		expect(screen.getByTestId("self-media-ops-metrics-dialog")).toHaveTextContent(
			"Post One Feed",
		)
	})

	it("shows action button labels when the article card is wide enough", async () => {
		await withMockedCardWidth(720, async () => {
			render(
				<SelfMediaRootRender
					data={ROOT_DATA}
					attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
					attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
					selectedProject={{ id: "project-1" }}
					allowEdit
				/>,
			)

			await waitFor(() => {
				expect(screen.getByTestId("self-media-home-post-actions-post-1")).toHaveAttribute(
					"data-label-mode",
					"expanded",
				)
			})
			expect(screen.getByTestId("self-media-home-post-analysis-post-1")).toHaveTextContent(
				"AI diagnosis",
			)
			expect(
				screen.queryByTestId("self-media-home-post-bind-link-post-1"),
			).not.toBeInTheDocument()
			expect(screen.getByTestId("self-media-home-post-ops-data-post-1")).toHaveTextContent(
				"Data",
			)
			expect(
				screen.queryByTestId("self-media-home-post-publish-ingest-post-1"),
			).not.toBeInTheDocument()
			expect(screen.getByTestId("self-media-home-post-review-card-post-1")).toHaveTextContent(
				"Create review",
			)
		})
	})

	it("opens the published link panel from the bound link status icon", async () => {
		mockLoadPostOpsSource.mockResolvedValue({
			version: 1,
			updatedAt: "2026-06-11T08:05:00.000Z",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			fetchStatus: "pending",
		})

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		expect(
			screen.queryByTestId("self-media-home-post-bind-link-post-1"),
		).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-artifact-post-1-source"))

		expect(
			await screen.findByTestId("self-media-home-post-bind-link-popover-post-1"),
		).toBeInTheDocument()
		await waitFor(() => {
			expect(screen.getByTestId("self-media-home-post-bind-link-input-post-1")).toHaveValue(
				"https://www.xiaohongshu.com/explore/post-1",
			)
		})
	})

	it("shows a loading state while the published link panel reads the saved link", async () => {
		mockLoadPostOpsSource.mockImplementation(() => new Promise(() => undefined))

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-artifact-post-1-source"))

		expect(
			await screen.findByTestId("self-media-home-post-bind-link-loading-post-1"),
		).toHaveTextContent("Loading link...")
		expect(
			screen.queryByTestId("self-media-home-post-bind-link-input-post-1"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-post-bind-link-save-post-1"),
		).not.toBeInTheDocument()
	})

	it("collapses action button labels when the article card is narrow", async () => {
		await withMockedCardWidth(320, async () => {
			render(
				<SelfMediaRootRender
					data={ROOT_DATA}
					attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
					attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
					selectedProject={{ id: "project-1" }}
					allowEdit
				/>,
			)

			await waitFor(() => {
				expect(screen.getByTestId("self-media-home-post-actions-post-1")).toHaveAttribute(
					"data-label-mode",
					"compact",
				)
			})
			expect(screen.getByTestId("self-media-home-post-ops-data-post-1")).toHaveTextContent("")
			expect(screen.getByTestId("self-media-home-post-ops-data-post-1")).toHaveAttribute(
				"aria-label",
				"Data",
			)
			expect(
				screen.queryByTestId("self-media-home-post-publish-ingest-post-1"),
			).not.toBeInTheDocument()
		})
	})

	it("shows the published link binding action before post-publish operations are available", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		expect(screen.getByTestId("self-media-home-post-bind-link-post-1")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-home-post-analysis-post-1")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-post-ops-data-post-1")).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-post-publish-ingest-post-1"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-home-post-review-card-post-1"),
		).not.toBeInTheDocument()
	})

	it("keeps action labels visible when only the diagnosis and link binding actions fit", async () => {
		await withMockedCardWidth(360, async () => {
			render(
				<SelfMediaRootRender
					data={ROOT_DATA}
					attachments={POST_DIRECTORY_ATTACHMENT_LIST}
					attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
					selectedProject={{ id: "project-1" }}
					allowEdit
				/>,
			)

			await waitFor(() => {
				expect(screen.getByTestId("self-media-home-post-actions-post-1")).toHaveAttribute(
					"data-label-mode",
					"expanded",
				)
			})
			expect(screen.getByTestId("self-media-home-post-analysis-post-1")).toHaveTextContent(
				"AI diagnosis",
			)
			expect(screen.getByTestId("self-media-home-post-bind-link-post-1")).toHaveTextContent(
				"Connect published link",
			)
		})
	})

	it("binds the published link from the article card without starting a fetch topic", async () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-bind-link-post-1"))
		fireEvent.change(await screen.findByTestId("self-media-home-post-bind-link-input-post-1"), {
			target: { value: "https://www.xiaohongshu.com/explore/bound-post-1" },
		})
		fireEvent.click(screen.getByTestId("self-media-home-post-bind-link-save-post-1"))

		await waitFor(() => {
			expect(mockSavePostOpsSource).toHaveBeenCalledWith("posts/post-1/post.json", {
				version: 1,
				updatedAt: expect.any(String),
				platform: "rednote",
				publishedUrl: "https://www.xiaohongshu.com/explore/bound-post-1",
				fetchStatus: "pending",
			})
		})
		expect(mockSendSelfMediaPostPublishDataRefresh).not.toHaveBeenCalled()
		expect(
			await screen.findByTestId("self-media-home-post-ops-data-post-1"),
		).toBeInTheDocument()
	})

	it("requires a non-empty published link before starting publish ingest", async () => {
		mockLoadPostOpsSource.mockResolvedValue({
			version: 1,
			updatedAt: "2026-06-11T08:05:00.000Z",
			platform: "rednote",
			publishedUrl: "   ",
			fetchStatus: "pending",
		})
		const attachmentList = [
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
								file_id: "source-json",
								file_name: "source.json",
								relative_file_path: "posts/post-1/ops/source.json",
							},
						],
					},
				],
			},
		] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={attachmentList}
				attachmentList={attachmentList}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-data-post-1"))
		fireEvent.click(await screen.findByTestId("self-media-home-post-data-sync-now-post-1"))

		await waitFor(() => {
			expect(mockLoadPostOpsSource).toHaveBeenCalledWith("posts/post-1/post.json")
		})
		expect(mockSendSelfMediaPostPublishDataRefresh).not.toHaveBeenCalled()
		expect(mockToastError).toHaveBeenCalledWith("Please bind the published article URL first.")
		expect(screen.getByTestId("self-media-ops-metrics-dialog")).toHaveTextContent(
			"Post One Feed",
		)
	})

	it("binds the published link and starts publish ingest from the article card", async () => {
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

		fireEvent.click(screen.getByTestId("self-media-home-post-bind-link-post-1"))
		fireEvent.change(await screen.findByTestId("self-media-home-post-bind-link-input-post-1"), {
			target: { value: "https://www.xiaohongshu.com/explore/bound-and-fetch-post-1" },
		})
		fireEvent.click(screen.getByTestId("self-media-home-post-bind-link-fetch-post-1"))

		await waitFor(() => {
			expect(mockSavePostOpsSource).toHaveBeenCalledWith("posts/post-1/post.json", {
				version: 1,
				updatedAt: expect.any(String),
				platform: "rednote",
				publishedUrl: "https://www.xiaohongshu.com/explore/bound-and-fetch-post-1",
				fetchStatus: "pending",
			})
		})
		await waitFor(() => {
			expect(mockSendSelfMediaPostPublishDataRefresh).toHaveBeenCalledWith(
				expect.objectContaining({
					publishedUrl: "https://www.xiaohongshu.com/explore/bound-and-fetch-post-1",
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
					}),
				}),
			)
		})
	})

	it("starts publish ingest when the published link has been bound", async () => {
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
		mockLoadPostOpsSource.mockResolvedValue({
			version: 1,
			updatedAt: "2026-06-11T08:05:00.000Z",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			fetchStatus: "pending",
		})
		const attachmentList = [
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
							{
								file_id: "source-json",
								file_name: "source.json",
								relative_file_path: "posts/post-1/ops/source.json",
							},
						],
					},
				],
			},
		] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={attachmentList}
				attachmentList={attachmentList}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-data-post-1"))
		fireEvent.click(await screen.findByTestId("self-media-home-post-data-sync-now-post-1"))

		await waitFor(() => {
			expect(mockSendSelfMediaPostPublishDataRefresh).toHaveBeenCalledWith(
				expect.objectContaining({
					selectedProject: { id: "project-1" },
					platform: "rednote",
					selectedModel: mockLanguageModel,
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
					}),
				}),
			)
		})
		expect(screen.queryByTestId("self-media-ops-metrics-dialog")).not.toBeInTheDocument()
	})

	it("configures post auto sync from the data popover", async () => {
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
		mockLoadPostOpsSource.mockResolvedValue({
			version: 1,
			updatedAt: "2026-06-11T08:05:00.000Z",
			platform: "rednote",
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			fetchStatus: "pending",
		})

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1", workspace_id: "workspace-1" } as never}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-data-post-1"))
		fireEvent.change(
			await screen.findByTestId("self-media-home-post-auto-sync-frequency-post-1"),
			{ target: { value: "weekly_repeat" } },
		)
		fireEvent.change(screen.getByTestId("self-media-home-post-auto-sync-time-post-1"), {
			target: { value: "10:30" },
		})
		fireEvent.change(await screen.findByTestId("self-media-home-post-auto-sync-day-post-1"), {
			target: { value: "2" },
		})
		fireEvent.click(screen.getByTestId("self-media-home-post-auto-sync-save-post-1"))

		await waitFor(() => {
			expect(mockBuildSelfMediaPostAutoSyncTaskData).toHaveBeenCalledWith(
				expect.objectContaining({
					workspaceId: "workspace-1",
					projectId: "project-1",
					platform: "rednote",
					publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
					post,
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
					}),
					model: mockLanguageModel,
					timeConfig: {
						type: "weekly_repeat",
						time: "10:30",
						day: "2",
					},
				}),
			)
		})
		expect(mockSaveSelfMediaPostAutoSyncTask).toHaveBeenCalledWith(
			expect.objectContaining({
				task_name: "[文章数据同步] Post One Feed",
			}),
			undefined,
		)
		expect(mockSavePostOpsSource).toHaveBeenCalledWith(
			"posts/post-1/post.json",
			expect.objectContaining({
				publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
				autoSync: expect.objectContaining({
					enabled: true,
					taskId: "task-1",
					timeConfig: {
						type: "weekly_repeat",
						time: "10:30",
						day: "2",
					},
				}),
			}),
		)
	})

	it("starts publish ingest from the operations workspace fetch button", async () => {
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
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-ops-data-post-1"))
		fireEvent.click(await screen.findByTestId("self-media-home-post-data-overview-post-1"))
		fireEvent.click(screen.getByTestId("self-media-ops-dialog-fetch"))

		await waitFor(() => {
			expect(mockSendSelfMediaPostPublishDataRefresh).toHaveBeenCalledWith(
				expect.objectContaining({
					publishedUrl: "https://www.xiaohongshu.com/explore/dialog-post-1",
					postDirectoryItem: expect.objectContaining({
						file_id: "post-dir",
						relative_file_path: "posts/post-1/",
					}),
				}),
			)
		})
		expect(mockLoadPostOpsSource).not.toHaveBeenCalled()
	})

	it("shows file-backed operations loop status on the article home", () => {
		const attachmentList = [
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
								file_id: "source-json",
								file_name: "source.json",
								relative_file_path: "posts/post-1/ops/source.json",
							},
							{
								file_id: "metrics-json",
								file_name: "metrics.json",
								relative_file_path: "posts/post-1/ops/metrics.json",
							},
							{
								file_id: "review-md",
								file_name: "review.md",
								relative_file_path: "posts/post-1/ops/review.md",
							},
						],
					},
				],
			},
		] as NonNullable<SelfMediaRootRenderProps["attachmentList"]>

		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={attachmentList}
				attachmentList={attachmentList}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		expect(screen.getByTestId("self-media-home-ops-overview")).toHaveTextContent(
			"Operations loop",
		)
		expect(screen.getByTestId("self-media-home-ops-overview-source")).toHaveTextContent("1/1")
		expect(screen.getByTestId("self-media-home-ops-overview-metrics")).toHaveTextContent("1/1")
		expect(screen.getByTestId("self-media-home-ops-overview-comments")).toHaveTextContent("0/1")
		expect(screen.getByTestId("self-media-home-ops-overview-review")).toHaveTextContent("1/1")
		expect(
			screen.getByTestId("self-media-home-post-ops-artifacts-post-1"),
		).not.toHaveTextContent(/Link bound|Metrics ready|Feedback not organized|Review ready/)
		expect(screen.queryByText("Link bound")).not.toBeInTheDocument()
		expect(screen.queryByText("Metrics ready")).not.toBeInTheDocument()
		expect(screen.queryByText("Feedback not organized")).not.toBeInTheDocument()
		expect(screen.queryByText("Review ready")).not.toBeInTheDocument()
		expect(
			screen.getByTestId("self-media-home-post-ops-artifact-post-1-source"),
		).toHaveAttribute("data-ready", "true")
		expect(
			screen.getByTestId("self-media-home-post-ops-artifact-post-1-metrics"),
		).toHaveAttribute("data-ready", "true")
		expect(
			screen.getByTestId("self-media-home-post-ops-artifact-post-1-comments"),
		).toHaveAttribute("data-ready", "false")
		expect(
			screen.getByTestId("self-media-home-post-ops-artifact-post-1-review"),
		).toHaveAttribute("data-ready", "true")
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

	it("opens an AI card review draft from a published article", () => {
		render(
			<SelfMediaRootRender
				data={ROOT_DATA}
				attachments={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				attachmentList={POST_DIRECTORY_WITH_SOURCE_ATTACHMENT_LIST}
				selectedProject={{ id: "project-1" }}
				allowEdit
			/>,
		)

		expect(screen.getByTestId("self-media-home-post-engagement-post-1")).toHaveTextContent(
			"1.2w",
		)
		expect(screen.getByTestId("self-media-home-post-engagement-post-1")).toHaveTextContent(
			"128",
		)

		fireEvent.click(screen.getByTestId("self-media-home-post-review-card-post-1"))

		expect(screen.getByTestId("self-media-ai-card-create-dialog")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-ai-card-create-task-name")).toHaveTextContent(
			"Review: Post One Feed",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"发布后表现复盘",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"Post One Feed",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent("RedNote")
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"Magic Lab",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent("1.2w")
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent("128")
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"ops/metrics.json",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"review.md",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"真实平台数据、用户补充数据和参考展示数据",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).not.toHaveTextContent(
			"根据 post.json.meta 中的参考互动数据先生成首版",
		)
		expect(screen.getByTestId("self-media-ai-card-create-prompt")).toHaveTextContent(
			"不要把参考展示数据写入 ops/metrics.json、ops/comments.json 或 ops/review.md",
		)
		expect(screen.getByTestId("self-media-ai-card-create-template")).toHaveTextContent(
			"analytics-panel",
		)
		expect(screen.getByTestId("self-media-ai-card-create-enabled")).toHaveTextContent("false")
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
