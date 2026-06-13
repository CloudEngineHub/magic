import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import SelfMediaHomePage from "../components/SelfMediaHomePage"
import SelfMediaOpsOverviewCard from "../components/SelfMediaOpsOverviewCard"
import { getSelfMediaHomeInsightDateKey } from "../services/selfMediaHomeInsight"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

const mocks = vi.hoisted(() => ({
	userInfo: {
		nickname: "Jiabo",
		real_name: "谢佳波",
	},
	chat: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			({
				"detail.selfMedia.home.articleCount": `${options?.count ?? 0} articles`,
				"detail.selfMedia.home.create": "Create",
			})[key] || key,
	}),
}))

vi.mock("@/models/user/hooks/useUserInfo", () => ({
	useUserInfo: () => ({
		userInfo: mocks.userInfo,
	}),
}))

vi.mock("@/services/ai", () => ({
	aiLLMService: {
		chat: mocks.chat,
	},
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
		<div className={className}>{children}</div>
	),
}))

vi.mock("../components/SelfMediaPostCard", () => ({
	default: ({
		onOpenPost,
		opening,
		openingDimmed,
		openingStyle,
	}: {
		onOpenPost: (
			target: { platform: "rednote"; index: number },
			transition?: {
				rect: { left: number; top: number; width: number; height: number }
				title: string
				subtitle: string
				postId: string
			},
		) => void
		opening?: boolean
		openingDimmed?: boolean
		openingStyle?: React.CSSProperties
	}) => (
		<button
			type="button"
			data-testid="mock-self-media-post-card"
			data-opening={opening ? "true" : "false"}
			data-dimmed={openingDimmed ? "true" : "false"}
			style={openingStyle}
			onClick={() =>
				onOpenPost(
					{ platform: "rednote", index: 0 },
					{
						rect: { left: 24, top: 144, width: 320, height: 160 },
						title: "Post One Feed",
						subtitle: "Post subtitle",
						postId: "post-1",
					},
				)
			}
		>
			Open post
		</button>
	),
}))

vi.mock("../components/SelfMediaOpsReviewDashboard", () => ({
	default: () => <div data-testid="mock-self-media-ops-review-dashboard" />,
}))

vi.mock("../components/PlatformBrandIcon", () => ({
	default: () => <span data-testid="mock-platform-brand-icon" />,
}))

vi.mock("../components/CardFrame", () => ({
	default: () => <div data-testid="mock-card-frame" />,
}))

function createPostItem(): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index: 0,
		entry: {
			id: "post-1",
			name: "Post One",
			entry: "posts/post-1/post.json",
		},
		post: {
			meta: {
				id: "post-1",
				title: "Post One",
				feedTitle: "Post One Feed",
			},
			cards: [],
		},
	}
}

describe("SelfMediaHomePage styles", () => {
	afterEach(() => {
		vi.useRealTimers()
		mocks.chat.mockReset()
		Reflect.deleteProperty(document, "startViewTransition")
	})

	it("hides published-data summary before any article is published", () => {
		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={vi.fn()} />)

		expect(screen.getByTestId("self-media-home-header")).toHaveTextContent(
			"今日重点：绑定发布链接",
		)
		expect(screen.getByTestId("self-media-home-header")).toHaveTextContent(
			"按优先级推进发布、数据和复盘，先把今日重点往前推。",
		)
		expect(
			screen.getAllByText("先绑定已发布链接，系统才能同步真实阅读、互动和评论数据。"),
		).toHaveLength(1)
		expect(screen.getByTestId("self-media-home-ops-overview")).toHaveTextContent("继续处理")
		expect(screen.queryByTestId("self-media-home-ops-data-summary")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-home-ops-completion")).toHaveTextContent("已发布")
		expect(screen.getByTestId("self-media-home-ops-completion")).toHaveTextContent(
			"发布 / 数据 / 评论 / 复盘",
		)
		expect(screen.getByTestId("self-media-home-ops-completion")).toHaveTextContent("0/1")
		expect(screen.getByTestId("self-media-home-ops-overview")).toHaveClass(
			"min-w-0",
			"max-w-full",
		)
		expect(screen.getByTestId("self-media-home-ops-health")).toHaveClass("w-full")
	})

	it("lets the compact home header actions adapt to the available width", () => {
		render(
			<SelfMediaHomePage
				posts={[createPostItem()]}
				onOpenPost={vi.fn()}
				onCreateArticle={vi.fn()}
			/>,
		)

		const createButton = screen.getByTestId("self-media-home-create-button")
		expect(createButton.className).not.toContain("min-w-[9rem]")
		expect(createButton.className).toContain("min-w-0")
		expect(createButton.querySelector("span")).toHaveClass("truncate")
	})

	it("uses the wide ops overview layout once the card reaches the near-max width", () => {
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 900,
				bottom: 420,
				width: 900,
				height: 420,
				toJSON: () => ({}),
			})

		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={vi.fn()} />)

		expect(screen.getByTestId("self-media-home-ops-overview")).toHaveAttribute(
			"data-ops-layout",
			"wide",
		)

		getBoundingClientRect.mockRestore()
	})

	it("responds to pointer movement on the ops overview card", () => {
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockReturnValue({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 400,
				bottom: 200,
				width: 400,
				height: 200,
				toJSON: () => ({}),
			})
		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={vi.fn()} />)

		const overview = screen.getByTestId("self-media-home-ops-overview")
		fireEvent.mouseMove(overview, { clientX: 100, clientY: 50 })

		expect(overview).toHaveStyle({
			"--ops-card-pointer-x": "25%",
			"--ops-card-pointer-y": "25%",
			"--ops-card-tilt-x": "1deg",
			"--ops-card-tilt-y": "-1.5deg",
		})

		fireEvent.mouseLeave(overview)

		expect(overview).toHaveStyle({
			"--ops-card-pointer-x": "50%",
			"--ops-card-pointer-y": "50%",
			"--ops-card-tilt-x": "0deg",
			"--ops-card-tilt-y": "0deg",
		})

		getBoundingClientRect.mockRestore()
	})

	it("animates overview numbers and progress bars from zero", () => {
		vi.useFakeTimers()
		render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 2, total: 3 },
						metrics: { done: 1, total: 3 },
						comments: { done: 1, total: 3 },
						review: { done: 0, total: 3 },
					},
					bestPost: null,
					weakestPost: null,
					nextActions: [],
				}}
			/>,
		)

		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveTextContent("0")
		expect(screen.getByTestId("self-media-home-ops-total-engagement")).toHaveTextContent("0")
		expect(screen.getByTestId("self-media-home-ops-engagement-rate")).toHaveTextContent("0%")
		expect(screen.getByTestId("self-media-home-ops-progress-source")).toHaveStyle({
			width: "0%",
		})

		act(() => {
			vi.advanceTimersByTime(720)
		})

		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveTextContent("1.2k")
		expect(screen.getByTestId("self-media-home-ops-total-engagement")).toHaveTextContent("170")
		expect(screen.getByTestId("self-media-home-ops-engagement-rate")).toHaveTextContent("4.7%")
		expect(screen.getByTestId("self-media-home-ops-progress-source")).toHaveStyle({
			width: "67%",
		})
	})

	it("shows a compact published-data summary with best-post context", () => {
		vi.useFakeTimers()
		render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 2, total: 3 },
						metrics: { done: 1, total: 3 },
						comments: { done: 1, total: 3 },
						review: { done: 0, total: 3 },
					},
					engagementTotals: {
						likes: 120,
						comments: 20,
						saves: 18,
						shares: 12,
					},
					bestPost: {
						postKey: "rednote:0:posts/top/post.json",
						title: "Top Post",
						platform: "rednote",
						index: 0,
						reads: 1200,
						engagement: 170,
						engagementRate: 0.1416,
					},
					weakestPost: {
						postKey: "rednote:1:posts/weak/post.json",
						title: "Weak Post",
						platform: "rednote",
						index: 1,
						reads: 240,
						engagement: 3,
						engagementRate: 0.0125,
					},
					nextActions: [],
					lastUpdatedAt: "2026-06-13T09:30:00+08:00",
				}}
			/>,
		)

		act(() => {
			vi.advanceTimersByTime(720)
		})

		expect(screen.getByTestId("self-media-home-ops-data-summary")).toHaveTextContent(
			"发布后数据汇总",
		)
		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveTextContent("1.2k")
		expect(screen.getByTestId("self-media-home-ops-likes")).toHaveTextContent("120")
		expect(screen.getByTestId("self-media-home-ops-comments")).toHaveTextContent("20")
		expect(screen.getByTestId("self-media-home-ops-saves")).toHaveTextContent("18")
		expect(screen.getByTestId("self-media-home-ops-shares")).toHaveTextContent("12")
		expect(screen.getByTestId("self-media-home-ops-best-post")).toHaveTextContent(
			"最佳样本：Top Post",
		)
	})

	it("keeps the aggregate metric labels stable in the decision panel", () => {
		vi.useFakeTimers()
		render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 2, total: 3 },
						metrics: { done: 1, total: 3 },
						comments: { done: 1, total: 3 },
						review: { done: 0, total: 3 },
					},
					bestPost: {
						postKey: "rednote:0:posts/top/post.json",
						title: "Top Post",
						platform: "rednote",
						index: 0,
						reads: 1200,
						engagement: 170,
						engagementRate: 0.1416,
					},
					weakestPost: {
						postKey: "rednote:1:posts/weak/post.json",
						title: "Weak Post",
						platform: "rednote",
						index: 1,
						reads: 240,
						engagement: 3,
						engagementRate: 0.0125,
					},
					nextActions: [],
					lastUpdatedAt: "2026-06-13T09:30:00+08:00",
				}}
			/>,
		)

		act(() => {
			vi.advanceTimersByTime(720)
		})

		const rateMetric = screen.getByTestId("self-media-home-ops-engagement-rate")
		expect(rateMetric).toHaveTextContent("平均互动率")
		expect(rateMetric).toHaveTextContent("4.7%")
		expect(screen.getByTestId("self-media-home-ops-data-summary")).toHaveTextContent("篇均阅读")
	})

	it("turns the overview into an operation decision panel", () => {
		render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 2, total: 3 },
						metrics: { done: 1, total: 3 },
						comments: { done: 1, total: 3 },
						review: { done: 0, total: 3 },
					},
					bestPost: null,
					weakestPost: null,
					nextActions: [
						{
							key: "sync-metrics",
							postKey: "rednote:0:posts/post-1/post.json",
							title: "同步最新数据",
							description:
								"已检测到发布源。现在可以同步最新阅读、点赞、评论和转发数据。",
							cta: "去同步",
							priority: 20,
						},
					],
				}}
			/>,
		)

		expect(screen.getByTestId("self-media-home-ops-headline")).toHaveTextContent(
			"当前瓶颈：2 篇待同步数据",
		)
		expect(screen.getByTestId("self-media-home-ops-summary")).toHaveTextContent(
			"先同步阅读、点赞、评论数据，解锁互动率判断。",
		)
		expect(screen.getByTestId("self-media-home-ops-health")).toHaveTextContent(/健康度\s*33/)
		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveTextContent(
			"已同步 1/3",
		)
		expect(screen.getByTestId("self-media-home-ops-action-sync-metrics")).toHaveTextContent(
			"解锁互动率判断",
		)
	})

	it("renders cached home daily insight content in the closed ops state", () => {
		render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 2,
					totalReads: 3200,
					totalEngagement: 516,
					engagementRate: 0.16125,
					operationStage: "closed",
					opportunityCount: 2,
					completion: {
						source: { done: 2, total: 2 },
						metrics: { done: 2, total: 2 },
						comments: { done: 2, total: 2 },
						review: { done: 2, total: 2 },
					},
					bestPost: {
						postKey: "rednote:0:posts/best/post.json",
						title: "Best Post",
						platform: "rednote",
						index: 0,
						reads: 2000,
						engagement: 380,
						engagementRate: 0.19,
					},
					weakestPost: null,
					nextActions: [
						{
							key: "plan-next-post",
							title: "规划下一篇内容",
							description: "当前运营链路已闭环，可以继续生成新选题。",
							cta: "新建文章",
							priority: 70,
						},
					],
					lastUpdatedAt: "2026-06-13T09:30:00+08:00",
				}}
				dailyInsight={{
					version: 1,
					date: "2026-06-13",
					generatedAt: "2026-06-13T09:00:00+08:00",
					stateSignature: "cached-signature",
					greeting: "Jiabo，今天可以看复用机会",
					summary: "链路已闭环，优先拆高互动样本。",
					actions: [
						{
							id: "reuse-best",
							title: "复用高互动结构",
							description: "从 Best Post 拆一套下一篇结构。",
							cta: "看样本",
							kind: "repurpose-best-post",
							postKey: "rednote:0:posts/best/post.json",
						},
					],
				}}
				dailyInsightStatus="cached"
				onRegenerateDailyInsight={vi.fn()}
			/>,
		)

		expect(screen.getByText("今日建议")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-home-daily-insight-refresh")).toHaveTextContent(
			"更新建议",
		)
		expect(screen.getByTestId("self-media-home-ops-aside")).not.toContainElement(
			screen.getByTestId("self-media-home-daily-insight-refresh"),
		)
		expect(screen.getByText("链路已闭环，优先拆高互动样本。")).toBeInTheDocument()
		expect(screen.getByText("链路已闭环，优先拆高互动样本。")).not.toHaveClass("line-clamp-2")
		expect(screen.getByTestId("self-media-home-ops-insight-greeting")).toHaveTextContent(
			"Jiabo，今天可以看复用机会",
		)
		expect(
			screen.getByTestId("self-media-home-ops-action-repurpose-best-post"),
		).toHaveTextContent("复用高互动结构")
		expect(screen.getByText("从 Best Post 拆一套下一篇结构。")).not.toHaveClass("line-clamp-2")
		expect(
			screen.queryByTestId("self-media-home-ops-action-plan-next-post"),
		).not.toBeInTheDocument()
	})

	it("places the cached daily insight greeting in the ops suggestion panel", async () => {
		const date = getSelfMediaHomeInsightDateKey()
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue({
				version: 1,
				date,
				generatedAt: "2026-06-14T08:00:00+08:00",
				stateSignature: "cached-signature",
				welcomeTitle: "今日重点：复用高互动样本",
				greeting: "早上好，谢佳博！今天是2026年6月14日，周日。",
				summary: "先看高互动样本，再安排下一篇。",
				actions: [
					{
						id: "reuse-best",
						title: "复用高互动结构",
						description: "拆一套下一篇结构。",
						cta: "看样本",
						kind: "repurpose-best-post",
					},
				],
			}),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}

		render(
			<SelfMediaHomePage
				posts={[createPostItem()]}
				onOpenPost={vi.fn()}
				homeDailyInsightStorage={storage}
				homeDailyInsightModelId="first-available-model"
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("self-media-home-ops-insight-greeting")).toHaveTextContent(
				"谢佳博，运营工作台已准备就绪",
			)
		})
		expect(screen.getByTestId("self-media-home-header")).toHaveTextContent(
			"今日重点：复用高互动样本",
		)
		expect(screen.getByTestId("self-media-home-header")).not.toHaveTextContent("早上好")
		expect(screen.getByTestId("self-media-home-header")).not.toHaveTextContent("谢佳博")
		expect(screen.getByTestId("self-media-home-header")).not.toHaveTextContent("2026年6月14日")
		expect(screen.getByTestId("self-media-home-header")).not.toHaveTextContent("周日")
		expect(screen.getByTestId("self-media-home-ops-insight-greeting")).not.toHaveTextContent(
			"早上好",
		)
		expect(screen.getByTestId("self-media-home-ops-insight-greeting")).not.toHaveTextContent(
			"2026年6月14日",
		)
		expect(screen.getByTestId("self-media-home-ops-insight-greeting")).not.toHaveTextContent(
			"周日",
		)
		expect(
			within(screen.getByTestId("self-media-home-ops-overview")).queryByText(
				"早上好，谢佳博！今天是2026年6月14日，周日。",
			),
		).not.toBeInTheDocument()
	})

	it("auto-generates home daily insight when the project opens and the insight file is missing", async () => {
		mocks.chat.mockResolvedValueOnce({
			content: JSON.stringify({
				welcomeTitle: "今日重点：复用高互动样本",
				greeting: "Jiabo，今天直接看复用机会",
				summary: "链路已闭环，优先拆高互动样本。",
				actions: [
					{
						id: "reuse-best",
						title: "复用高互动结构",
						description: "从高互动样本拆一套下一篇结构。",
						cta: "看样本",
						kind: "repurpose-best-post",
					},
				],
			}),
		})
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(null),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}

		render(
			<SelfMediaHomePage
				posts={[createPostItem()]}
				onOpenPost={vi.fn()}
				homeDailyInsightStorage={storage}
				homeDailyInsightModelId="first-available-model"
			/>,
		)

		await waitFor(() => {
			expect(storage.loadHomeDailyInsight).toHaveBeenCalledTimes(1)
		})
		await waitFor(() => {
			expect(storage.saveHomeDailyInsight).toHaveBeenCalled()
		})
		await waitFor(() => {
			expect(screen.getByTestId("self-media-home-header")).toHaveTextContent(
				"今日重点：复用高互动样本",
			)
		})
		expect(storage.saveHomeDailyInsight.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				welcomeTitle: "今日重点：复用高互动样本",
			}),
		)
		expect(mocks.chat).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({
				model: "first-available-model",
			}),
		)
	})

	it("waits for an available model before auto-generating home daily insight", async () => {
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(null),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}

		render(
			<SelfMediaHomePage
				posts={[createPostItem()]}
				onOpenPost={vi.fn()}
				homeDailyInsightStorage={storage}
			/>,
		)

		await waitFor(() => {
			expect(storage.loadHomeDailyInsight).not.toHaveBeenCalled()
		})
		expect(mocks.chat).not.toHaveBeenCalled()
	})

	it("adds breathing motion only to active operation states", () => {
		const { rerender } = render(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 3, total: 3 },
						metrics: { done: 1, total: 3 },
						comments: { done: 0, total: 3 },
						review: { done: 0, total: 3 },
					},
					bestPost: null,
					weakestPost: null,
					nextActions: [],
				}}
			/>,
		)

		expect(screen.getByTestId("self-media-home-ops-overview")).toHaveClass(
			"self-media-ops-breathing-surface",
		)
		expect(screen.getByTestId("self-media-home-ops-overview-breath")).toHaveClass(
			"self-media-ops-breathing-glow",
		)
		expect(screen.getByTestId("self-media-home-ops-overview-breath")).toHaveClass("inset-0")
		expect(screen.getByTestId("self-media-home-ops-overview-breath")).not.toHaveClass(
			"-inset-16",
		)
		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveAttribute(
			"data-motion",
			"active",
		)
		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveClass(
			"self-media-ops-metric-flow",
		)

		rerender(
			<SelfMediaOpsOverviewCard
				overview={{
					totalPosts: 3,
					totalReads: 1200,
					totalEngagement: 170,
					engagementRate: 0.0472,
					completion: {
						source: { done: 3, total: 3 },
						metrics: { done: 3, total: 3 },
						comments: { done: 3, total: 3 },
						review: { done: 3, total: 3 },
					},
					bestPost: null,
					weakestPost: null,
					nextActions: [],
				}}
			/>,
		)

		expect(screen.getByTestId("self-media-home-ops-total-reads")).toHaveAttribute(
			"data-motion",
			"idle",
		)
		expect(screen.getByTestId("self-media-home-ops-total-reads")).not.toHaveClass(
			"self-media-ops-metric-flow",
		)
		expect(screen.queryByTestId("self-media-home-ops-completion")).not.toBeInTheDocument()
	})

	it("opens the relevant next action from the quick continue list", () => {
		const onOpenPost = vi.fn()
		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={onOpenPost} />)

		fireEvent.click(screen.getByTestId("self-media-home-ops-action-bind-source"))

		expect(onOpenPost).toHaveBeenCalledWith({ platform: "rednote", index: 0 })
	})

	it("keeps the home header in the normal scroll layout", () => {
		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={vi.fn()} />)

		const header = screen.getByTestId("self-media-home-header")
		const main = screen.getByTestId("self-media-home-main")

		expect(main).toContainElement(header)
		expect(header.parentElement).not.toBe(screen.getByTestId("self-media-home-page"))
	})

	it("does not show a dead create action in the empty state when creation is unavailable", () => {
		render(<SelfMediaHomePage posts={[]} onOpenPost={vi.fn()} />)

		expect(screen.getByTestId("self-media-home-empty")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-home-empty-create-button")).not.toBeInTheDocument()
	})

	it("uses native view transitions to open the detail view in the same interaction", () => {
		const onOpenPost = vi.fn()
		const startViewTransition = vi.fn((callback: () => void) => {
			callback()
			return {
				finished: Promise.resolve(),
				ready: Promise.resolve(),
				updateCallbackDone: Promise.resolve(),
			}
		})
		Object.defineProperty(document, "startViewTransition", {
			configurable: true,
			value: startViewTransition,
		})

		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={onOpenPost} />)

		fireEvent.click(screen.getByTestId("mock-self-media-post-card"))

		const card = screen.getByTestId("mock-self-media-post-card")
		expect(startViewTransition).toHaveBeenCalledTimes(1)
		expect(onOpenPost).toHaveBeenCalledWith({ platform: "rednote", index: 0 })
		expect(screen.getByTestId("self-media-home-page")).toHaveClass("self-media-home-opening")
		expect(card).toHaveAttribute("data-opening", "true")
		expect(card).toHaveStyle({
			"--open-card-lift": "-4px",
			"--open-card-scale": "0.996",
		})
	})

	it("uses a short selected-card fallback before opening the detail view", () => {
		vi.useFakeTimers()
		const onOpenPost = vi.fn()
		render(<SelfMediaHomePage posts={[createPostItem()]} onOpenPost={onOpenPost} />)

		fireEvent.click(screen.getByTestId("mock-self-media-post-card"))

		const card = screen.getByTestId("mock-self-media-post-card")
		expect(screen.queryByTestId("self-media-home-open-transition")).not.toBeInTheDocument()
		expect(screen.getByTestId("self-media-home-page")).toHaveClass("self-media-home-opening")
		expect(screen.getByTestId("self-media-home-ops-overview").parentElement).toHaveClass(
			"self-media-home-opening-dim",
		)
		expect(card).toHaveAttribute("data-opening", "true")
		expect(card).toHaveAttribute("data-dimmed", "false")
		expect(card).toHaveStyle({
			"--open-card-lift": "-4px",
			"--open-card-scale": "0.996",
		})
		expect(card.getAttribute("style")).not.toContain("--open-card-scale-x")
		expect(card.getAttribute("style")).not.toContain("--open-card-scale-y")
		expect(onOpenPost).not.toHaveBeenCalled()

		act(() => {
			vi.advanceTimersByTime(109)
		})
		expect(onOpenPost).not.toHaveBeenCalled()

		act(() => {
			vi.advanceTimersByTime(1)
		})

		expect(onOpenPost).toHaveBeenCalledWith({ platform: "rednote", index: 0 })
	})
})
