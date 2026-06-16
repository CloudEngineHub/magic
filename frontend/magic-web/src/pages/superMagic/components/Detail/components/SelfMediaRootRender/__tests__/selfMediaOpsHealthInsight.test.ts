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
	buildFallbackSelfMediaOpsHealthInsight,
	buildSelfMediaOpsHealthInsightSignature,
	generateSelfMediaOpsHealthInsight,
	resolveSelfMediaOpsHealthInsight,
	type SelfMediaOpsHealthInsightPayload,
} from "../services/selfMediaOpsHealthInsight"

function createOverview(overrides: Partial<SelfMediaOpsOverview> = {}): SelfMediaOpsOverview {
	return {
		totalPosts: 2,
		totalReads: 3200,
		totalEngagement: 516,
		engagementTotals: {
			likes: 420,
			comments: 36,
			saves: 48,
			shares: 12,
		},
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
		...overrides,
	}
}

function createInsight(
	overview: SelfMediaOpsOverview,
	overrides: Partial<SelfMediaOpsHealthInsightPayload> = {},
): SelfMediaOpsHealthInsightPayload {
	return {
		version: 1,
		generatedAt: "2026-06-13T09:00:00+08:00",
		stateSignature: buildSelfMediaOpsHealthInsightSignature(overview),
		score: 82,
		level: "good",
		summary: "链路完整，真实互动质量稳定。",
		reasons: ["发布、数据、评论、复盘已闭环", "互动率高于常规复用阈值"],
		nextAction: "复用 Best Post 的内容结构。",
		confidence: "high",
		...overrides,
	}
}

describe("self-media ops health insight", () => {
	it("generates an AI health score and persists it by the current state signature", async () => {
		const overview = createOverview()
		aiMocks.chat.mockResolvedValueOnce({
			content: JSON.stringify({
				score: 76,
				level: "warning",
				summary: "链路闭环，但互动分布仍需复查。",
				reasons: ["评论量偏少", "收藏和分享没有形成复用优势"],
				nextAction: "优先复盘互动最高的文章。",
				confidence: "medium",
			}),
		})

		const result = await generateSelfMediaOpsHealthInsight({
			overview,
			now: new Date("2026-06-13T10:00:00+08:00"),
			model: "gpt-test",
		})

		expect(result).toEqual(
			expect.objectContaining({
				version: 1,
				score: 76,
				level: "warning",
				confidence: "medium",
				stateSignature: buildSelfMediaOpsHealthInsightSignature(overview),
			}),
		)
		expect(aiMocks.chat).toHaveBeenCalledWith(
			expect.any(Array),
			expect.objectContaining({
				model: "gpt-test",
			}),
		)
	})

	it("reuses a cached insight only when the state signature still matches", async () => {
		const overview = createOverview()
		const cached = createInsight(overview)
		const storage = {
			loadOpsHealthInsight: vi.fn().mockResolvedValue(cached),
			saveOpsHealthInsight: vi.fn(),
		}
		const generate = vi.fn()

		const result = await resolveSelfMediaOpsHealthInsight({
			overview,
			storage,
			generate,
		})

		expect(result.insight).toBe(cached)
		expect(result.status).toBe("cached")
		expect(generate).not.toHaveBeenCalled()
		expect(storage.saveOpsHealthInsight).not.toHaveBeenCalled()
	})

	it("regenerates when the cached state signature is stale", async () => {
		const overview = createOverview()
		const generated = createInsight(overview, { score: 68, level: "warning" })
		const storage = {
			loadOpsHealthInsight: vi.fn().mockResolvedValue(
				createInsight(overview, {
					stateSignature: "old-state",
					score: 90,
				}),
			),
			saveOpsHealthInsight: vi.fn().mockResolvedValue(undefined),
		}
		const generate = vi.fn().mockResolvedValue(generated)

		const result = await resolveSelfMediaOpsHealthInsight({
			overview,
			storage,
			generate,
		})

		expect(result.insight).toBe(generated)
		expect(result.status).toBe("generated")
		expect(storage.saveOpsHealthInsight).toHaveBeenCalledWith(generated)
	})

	it("continues generation when loading the cached health insight fails", async () => {
		const overview = createOverview()
		const generated = createInsight(overview, { score: 74, level: "warning" })
		const storage = {
			loadOpsHealthInsight: vi.fn().mockRejectedValue(new Error("read failed")),
			saveOpsHealthInsight: vi.fn().mockResolvedValue(undefined),
		}
		const generate = vi.fn().mockResolvedValue(generated)

		const result = await resolveSelfMediaOpsHealthInsight({
			overview,
			storage,
			generate,
		})

		expect(result.insight).toBe(generated)
		expect(result.status).toBe("generated")
		expect(storage.saveOpsHealthInsight).toHaveBeenCalledWith(generated)
	})

	it("does not report perfect AI health when the workflow is complete but data is still zero", () => {
		const insight = buildFallbackSelfMediaOpsHealthInsight({
			overview: createOverview({
				totalReads: 0,
				totalEngagement: 0,
				engagementTotals: {
					likes: 0,
					comments: 0,
					saves: 0,
					shares: 0,
				},
				engagementRate: null,
				bestPost: null,
				weakestPost: null,
			}),
			now: new Date("2026-06-13T10:00:00+08:00"),
		})

		expect(insight.score).toBeLessThan(100)
		expect(insight.level).toBe("warning")
		expect(insight.summary).toContain("真实")
		expect(insight.reasons.join(" ")).toContain("0")
	})
})
