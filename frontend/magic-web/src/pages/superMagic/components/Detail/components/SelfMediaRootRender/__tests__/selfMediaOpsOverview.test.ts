import { describe, expect, it } from "vitest"
import { buildSelfMediaOpsOverview, getSelfMediaPostKey } from "../services/selfMediaOpsOverview"
import type { SelfMediaPostOpsMetricsPayload } from "../services/SelfMediaFileStorageService"
import type { SelfMediaPostOpsArtifacts } from "../services/selfMediaOpsArtifactStates"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

function createPostItem(id: string, index: number, title: string): SelfMediaPlatformPostItem {
	return {
		platform: "rednote",
		index,
		entry: {
			id,
			name: title,
			entry: `posts/${id}/post.json`,
		},
		post: {
			meta: {
				id,
				title,
				feedTitle: title,
			},
			cards: [],
		},
	}
}

function metrics(
	values: SelfMediaPostOpsMetricsPayload["metrics"],
): SelfMediaPostOpsMetricsPayload {
	return {
		version: 1,
		updatedAt: "2026-06-13T10:00:00.000Z",
		source: "real-platform",
		metrics: values,
	}
}

const readyArtifacts: SelfMediaPostOpsArtifacts = {
	source: true,
	metrics: true,
	comments: true,
	review: true,
}

describe("self-media ops overview", () => {
	it("summarizes engagement health and ranks next actions from existing ops artifacts", () => {
		const missingSource = createPostItem("missing-source", 0, "Missing Source")
		const needsReview = createPostItem("needs-review", 1, "Needs Review")
		const weakEngagement = createPostItem("weak-engagement", 2, "Weak Engagement")
		const posts = [missingSource, needsReview, weakEngagement]
		const artifactsByPostKey = new Map<string, SelfMediaPostOpsArtifacts>([
			[
				getSelfMediaPostKey(missingSource),
				{ source: false, metrics: false, comments: false, review: false },
			],
			[
				getSelfMediaPostKey(needsReview),
				{ source: true, metrics: true, comments: true, review: false },
			],
			[getSelfMediaPostKey(weakEngagement), readyArtifacts],
		])
		const metricsByPostKey = new Map<string, SelfMediaPostOpsMetricsPayload | null>([
			[
				getSelfMediaPostKey(needsReview),
				metrics({ reads: "1.2k", likes: "96", comments: "12", saves: "24", shares: "8" }),
			],
			[
				getSelfMediaPostKey(weakEngagement),
				metrics({ reads: 2400, likes: 24, commentCount: 3, saves: 2, shares: 1 }),
			],
		])

		const overview = buildSelfMediaOpsOverview({
			posts,
			artifactsByPostKey,
			metricsByPostKey,
		})

		expect(overview.totalPosts).toBe(3)
		expect(overview.totalReads).toBe(3600)
		expect(overview.totalEngagement).toBe(170)
		expect(overview.engagementRate).toBeCloseTo(0.0472, 4)
		expect(overview.bestPost?.title).toBe("Needs Review")
		expect(overview.weakestPost?.title).toBe("Weak Engagement")
		expect(overview.completion).toEqual({
			source: { done: 2, total: 3 },
			metrics: { done: 2, total: 3 },
			comments: { done: 2, total: 3 },
			review: { done: 1, total: 3 },
		})
		expect(overview.nextActions.map((item) => item.key)).toEqual([
			"bind-source",
			"generate-review",
			"improve-weak-post",
		])
		expect(overview.nextActions[0]).toMatchObject({
			postKey: getSelfMediaPostKey(missingSource),
			title: "绑定已发布链接",
			cta: "去绑定",
		})
		expect(overview.nextActions[0].description).toBe(
			"这篇文章还没绑定发布链接。绑定后，系统才能同步真实阅读、点赞和评论数据。",
		)
	})
})
