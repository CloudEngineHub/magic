import { describe, expect, it, vi } from "vitest"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"

const aiMocks = vi.hoisted(() => ({
	chat: vi.fn(),
}))

vi.mock("@/services/ai", () => ({
	aiLLMService: {
		chat: aiMocks.chat,
	},
}))

import {
	formatSelfMediaHomeInsightGreeting,
	formatSelfMediaHomeWelcomeTitle,
	generateSelfMediaHomeDailyInsight,
	getSelfMediaHomeInsightDateKey,
	resolveSelfMediaHomeDailyInsight,
	type SelfMediaHomeDailyInsightPayload,
} from "../services/selfMediaHomeInsight"

function createOverview(): SelfMediaOpsOverview {
	return {
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
		nextActions: [],
		lastUpdatedAt: "2026-06-13T09:30:00+08:00",
	}
}

function createInsight(date: string): SelfMediaHomeDailyInsightPayload {
	return {
		version: 1,
		date,
		generatedAt: `${date}T09:00:00+08:00`,
		stateSignature: "cached-signature",
		welcomeTitle: "今日重点：复用高互动样本",
		greeting: "今天可以看复用机会",
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
	}
}

describe("self-media home daily insight", () => {
	it("formats the local date key used for once-per-day generation", () => {
		expect(getSelfMediaHomeInsightDateKey(new Date("2026-06-13T01:23:45+08:00"))).toBe(
			"2026-06-13",
		)
	})

	it("formats daily insight greeting without date or time expressions", () => {
		expect(
			formatSelfMediaHomeInsightGreeting(
				"早上好，谢佳博！今天是2026年6月14日，周日。你的运营工作台已准备就绪。",
				"谢佳博，运营工作台已准备就绪",
			),
		).toBe("谢佳博！你的运营工作台已准备就绪")
		expect(
			formatSelfMediaHomeInsightGreeting(
				"早上好，谢佳博！今天是2026年6月14日，周日。",
				"谢佳博，运营工作台已准备就绪",
			),
		).toBe("谢佳博，运营工作台已准备就绪")
	})

	it("keeps the home welcome title short and focused on today's priority", () => {
		const fallback = "今日重点：同步发布数据"
		expect(formatSelfMediaHomeWelcomeTitle("今日重点：复用高互动样本", fallback)).toBe(
			"今日重点：复用高互动样本",
		)
		expect(
			formatSelfMediaHomeWelcomeTitle("早上好，今天是2026年6月14日，周日。", fallback),
		).toBe(fallback)
		expect(
			formatSelfMediaHomeWelcomeTitle(
				"今日重点：运营数据链路尚未打通，优先完成来源绑定与数据同步后再启动复盘",
				fallback,
			),
		).toBe(fallback)
	})

	it("reuses a same-day cached insight without calling the generator", async () => {
		const cached = createInsight("2026-06-13")
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(cached),
			saveHomeDailyInsight: vi.fn(),
		}
		const generate = vi.fn()

		const result = await resolveSelfMediaHomeDailyInsight({
			overview: createOverview(),
			displayName: "测试用户",
			storage,
			now: new Date("2026-06-13T10:30:00+08:00"),
			generate,
		})

		expect(result.insight).toBe(cached)
		expect(result.status).toBe("cached")
		expect(generate).not.toHaveBeenCalled()
		expect(storage.saveHomeDailyInsight).not.toHaveBeenCalled()
	})

	it("generates and saves a new insight when the cached date is stale", async () => {
		const generated = createInsight("2026-06-13")
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(createInsight("2026-06-12")),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}
		const generate = vi.fn().mockResolvedValue(generated)

		const result = await resolveSelfMediaHomeDailyInsight({
			overview: createOverview(),
			displayName: "测试用户",
			storage,
			now: new Date("2026-06-13T10:30:00+08:00"),
			model: "first-available-model",
			generate,
		})

		expect(result.insight).toBe(generated)
		expect(result.status).toBe("generated")
		expect(generate).toHaveBeenCalledWith(
			expect.objectContaining({
				overview: createOverview(),
				displayName: "测试用户",
				date: "2026-06-13",
				model: "first-available-model",
			}),
		)
		expect(storage.saveHomeDailyInsight).toHaveBeenCalledWith(generated)
	})

	it("generates and saves a new insight when the insight file is missing", async () => {
		const generated = createInsight("2026-06-13")
		const storage = {
			loadHomeDailyInsight: vi.fn().mockResolvedValue(null),
			saveHomeDailyInsight: vi.fn().mockResolvedValue(undefined),
		}
		const generate = vi.fn().mockResolvedValue(generated)

		const result = await resolveSelfMediaHomeDailyInsight({
			overview: createOverview(),
			displayName: "测试用户",
			storage,
			now: new Date("2026-06-13T10:30:00+08:00"),
			model: "first-available-model",
			generate,
		})

		expect(result.insight).toBe(generated)
		expect(result.status).toBe("generated")
		expect(storage.loadHomeDailyInsight).toHaveBeenCalledTimes(1)
		expect(generate).toHaveBeenCalledWith(
			expect.objectContaining({
				date: "2026-06-13",
				model: "first-available-model",
			}),
		)
		expect(storage.saveHomeDailyInsight).toHaveBeenCalledWith(generated)
	})

	it("passes the selected model to the AI gateway", async () => {
		aiMocks.chat.mockResolvedValueOnce({
			content: JSON.stringify({
				welcomeTitle: "今日重点：复用高互动样本",
				greeting: "测试用户，今天看复用机会",
				summary: "链路已闭环，优先拆高互动样本。",
				actions: [
					{
						id: "reuse-best",
						title: "复用高互动结构",
						description: "从 Best Post 拆一套下一篇结构。",
						cta: "看样本",
						kind: "repurpose-best-post",
						postKey: "rednote:0:posts/best/post.json",
						targetTitle: "Best Post",
					},
				],
			}),
		})

		const result = await generateSelfMediaHomeDailyInsight({
			overview: createOverview(),
			displayName: "测试用户",
			date: "2026-06-13",
			model: "first-available-model",
		})

		expect(result.welcomeTitle).toBe("今日重点：复用高互动样本")
		expect(result.actions[0]).toMatchObject({
			postKey: "rednote:0:posts/best/post.json",
			targetTitle: "Best Post",
		})
		expect(aiMocks.chat).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({
				model: "first-available-model",
			}),
		)
		const prompt = aiMocks.chat.mock.calls[0]?.[0]?.[0]?.content
		expect(prompt).toContain('"actionCandidates"')
		expect(prompt).toContain('"targetTitle": "Best Post"')
		expect(aiMocks.chat.mock.calls[0]?.[1]).not.toHaveProperty("maxTokens")
		expect(aiMocks.chat.mock.calls[0]?.[1]).not.toHaveProperty("max_tokens")
	})

	it("merges AI copy onto preset action candidates and rejects unknown actions", async () => {
		aiMocks.chat.mockResolvedValueOnce({
			content: JSON.stringify({
				welcomeTitle: "今日重点：复用高互动样本",
				greeting: "测试用户，今天看复用机会",
				summary: "链路已闭环，优先拆高互动样本。",
				actions: [
					{
						id: "ai-reuse",
						title: "把高互动样本拆成下一篇",
						description: "沿用这篇文章的开头结构。",
						cta: "看样本",
						kind: "repurpose-best-post",
						postKey: "rednote:0:posts/best/post.json",
					},
					{
						id: "invented",
						title: "发明一个动作",
						description: "这个动作不在候选里。",
						cta: "去处理",
						kind: "collect-comments",
						postKey: "rednote:999:posts/unknown/post.json",
					},
				],
			}),
		})

		const result = await generateSelfMediaHomeDailyInsight({
			overview: {
				...createOverview(),
				nextActions: [
					{
						key: "repurpose-best-post",
						postKey: "rednote:0:posts/best/post.json",
						targetTitle: "Best Post",
						title: "复用高互动结构",
						description: "拆解高互动文章。",
						cta: "看样本",
						priority: 60,
					},
				],
			},
			displayName: "测试用户",
			date: "2026-06-13",
			model: "first-available-model",
		})

		expect(result.actions).toHaveLength(1)
		expect(result.actions[0]).toMatchObject({
			id: "ai-reuse",
			kind: "repurpose-best-post",
			postKey: "rednote:0:posts/best/post.json",
			targetTitle: "Best Post",
			title: "把高互动样本拆成下一篇",
		})
	})
})
