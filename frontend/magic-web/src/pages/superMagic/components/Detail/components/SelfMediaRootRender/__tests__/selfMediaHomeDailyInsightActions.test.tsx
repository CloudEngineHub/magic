import { act, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import { buildDailyInsightDisplayActions } from "../services/selfMediaOpsOverviewDailyInsight"
import { executeSelfMediaOpsOverviewAction } from "../services/selfMediaOpsOverviewActionRunner"
import {
	getSelfMediaHomeInsightDateKey,
	type SelfMediaHomeDailyInsightPayload,
} from "../services/selfMediaHomeInsight"
import { useSelfMediaHomeDailyInsight } from "../hooks/useSelfMediaHomeDailyInsight"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"

const overview: SelfMediaOpsOverview = {
	totalPosts: 2,
	totalReads: 3000,
	totalEngagement: 420,
	engagementTotals: {
		likes: 240,
		comments: 80,
		saves: 70,
		shares: 30,
	},
	engagementRate: 0.14,
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
		reads: 2200,
		engagement: 360,
		engagementRate: 0.16,
	},
	weakestPost: {
		postKey: "rednote:1:posts/weak/post.json",
		title: "Weak Post",
		platform: "rednote",
		index: 1,
		reads: 800,
		engagement: 60,
		engagementRate: 0.075,
	},
	nextActions: [],
	operationStage: "closed",
	opportunityCount: 2,
}

function createInsight(): SelfMediaHomeDailyInsightPayload {
	return {
		version: 1,
		date: getSelfMediaHomeInsightDateKey(),
		generatedAt: "2026-06-14T08:00:00+08:00",
		stateSignature: "current",
		greeting: "今天优先复用内容资产",
		summary: "先拆高互动样本，再修复弱互动文章。",
		actions: [
			{
				id: "reuse-best",
				title: "复用高互动结构",
				description: "从高互动样本拆一套下一篇结构。",
				cta: "看样本",
				kind: "repurpose-best-post",
			},
			{
				id: "improve-weak",
				title: "优化弱互动文章",
				description: "调整标题和开头。",
				cta: "去优化",
				kind: "improve-weak-post",
			},
		],
	}
}

function createPostItem(index: number, entry: string): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index,
		entry: {
			id: `post-${index}`,
			name: `Post ${index}`,
			entry,
		},
		post: {
			meta: {
				id: `post-${index}`,
				title: `Post ${index}`,
				feedTitle: `Post ${index} Feed`,
			},
			cards: [],
		},
	}
}

describe("self-media home daily insight actions", () => {
	it("maps AI generated suggestions without postKey to the matching post action target", () => {
		const actions = buildDailyInsightDisplayActions({
			dailyInsight: createInsight(),
			overview,
			dismissedDailyInsightActionIds: [],
		})

		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "repurpose-best-post",
					postKey: "rednote:0:posts/best/post.json",
					targetTitle: "Best Post",
				}),
				expect.objectContaining({
					key: "improve-weak-post",
					postKey: "rednote:1:posts/weak/post.json",
					targetTitle: "Weak Post",
				}),
			]),
		)
	})

	it("executes preset daily insight action keys through the existing home actions", () => {
		const onOpenPost = vi.fn()
		const onCreateArticle = vi.fn()
		const onPostPublishRefresh = vi.fn()
		const onOpenOpsReview = vi.fn()
		const postsByPostKey = new Map([
			["rednote:0:posts/best/post.json", createPostItem(0, "posts/best/post.json")],
		])

		executeSelfMediaOpsOverviewAction({
			action: {
				key: "repurpose-best-post",
				postKey: "rednote:0:posts/best/post.json",
				title: "复用高互动结构",
				description: "从高互动样本拆一套下一篇结构。",
				cta: "看样本",
				priority: 80,
			},
			postsByPostKey,
			onOpenPost,
			onCreateArticle,
			onPostPublishRefresh,
			onOpenOpsReview,
		})

		expect(onOpenPost).toHaveBeenCalledWith({ platform: "rednote", index: 0 })

		executeSelfMediaOpsOverviewAction({
			action: {
				key: "plan-next-post",
				title: "规划下一篇内容",
				description: "补一篇承接内容。",
				cta: "新建文章",
				priority: 81,
			},
			postsByPostKey,
			onOpenPost,
			onCreateArticle,
			onPostPublishRefresh,
			onOpenOpsReview,
		})

		expect(onCreateArticle).toHaveBeenCalledTimes(1)
	})

	it("routes setup and review actions to the matching home workflow target", () => {
		const onOpenPost = vi.fn()
		const onOpenPublishedLinkBinding = vi.fn()
		const onOpenOpsMetrics = vi.fn()
		const onPostPublishRefresh = vi.fn()
		const onOpenOpsReview = vi.fn()
		const postsByPostKey = new Map([
			["rednote:0:posts/best/post.json", createPostItem(0, "posts/best/post.json")],
		])

		executeSelfMediaOpsOverviewAction({
			action: {
				key: "bind-source",
				postKey: "rednote:0:posts/best/post.json",
				title: "绑定已发布链接",
				description: "补齐链接",
				cta: "去绑定",
				priority: 10,
			},
			postsByPostKey,
			onOpenPost,
			onOpenPublishedLinkBinding,
			onOpenOpsMetrics,
			onPostPublishRefresh,
			onOpenOpsReview,
		})

		expect(onOpenPublishedLinkBinding).toHaveBeenCalledWith(
			createPostItem(0, "posts/best/post.json"),
		)
		expect(onOpenPost).not.toHaveBeenCalled()

		executeSelfMediaOpsOverviewAction({
			action: {
				key: "collect-comments",
				postKey: "rednote:0:posts/best/post.json",
				title: "补充评论反馈",
				description: "补评论",
				cta: "补评论",
				priority: 30,
			},
			postsByPostKey,
			onOpenPost,
			onOpenPublishedLinkBinding,
			onOpenOpsMetrics,
			onPostPublishRefresh,
			onOpenOpsReview,
		})

		expect(onOpenOpsMetrics).toHaveBeenCalledWith(createPostItem(0, "posts/best/post.json"))
		expect(onPostPublishRefresh).not.toHaveBeenCalled()
	})

	it("persists removed AI generated suggestions back to the insight file", async () => {
		const cachedInsight = createInsight()
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(cachedInsight),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}

		function Harness() {
			const dailyInsight = useSelfMediaHomeDailyInsight({
				overview,
				enabled: true,
				model: "first-available-model",
				storage,
			})

			return (
				<div>
					<div data-testid="action-titles">
						{dailyInsight.insight?.actions.map((action) => action.title).join(",") ||
							""}
					</div>
					<button type="button" onClick={() => dailyInsight.dismissAction("reuse-best")}>
						remove
					</button>
				</div>
			)
		}

		render(<Harness />)

		await waitFor(() => {
			expect(screen.getByTestId("action-titles")).toHaveTextContent("复用高互动结构")
		})

		await act(async () => {
			screen.getByText("remove").click()
		})

		expect(screen.getByTestId("action-titles")).not.toHaveTextContent("复用高互动结构")
		expect(storage.saveHomeDailyInsight).toHaveBeenCalledWith(
			expect.objectContaining({
				actions: [
					expect.objectContaining({
						id: "improve-weak",
					}),
				],
			}),
		)
	})
})
