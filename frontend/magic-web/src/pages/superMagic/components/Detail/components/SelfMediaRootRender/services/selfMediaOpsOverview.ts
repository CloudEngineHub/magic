import type { SelfMediaPostOpsMetricsPayload } from "./SelfMediaFileStorageService"
import type { SelfMediaPostOpsArtifacts } from "./selfMediaOpsArtifactStates"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

export interface SelfMediaOpsOverviewInput {
	posts: SelfMediaPlatformPostItem[]
	artifactsByPostKey: Map<string, SelfMediaPostOpsArtifacts>
	metricsByPostKey: Map<string, SelfMediaPostOpsMetricsPayload | null>
}

export interface SelfMediaOpsOverviewCompletionItem {
	done: number
	total: number
}

export interface SelfMediaOpsOverviewPostSummary {
	postKey: string
	title: string
	platform: SelfMediaPlatformPostItem["platform"]
	index: number
	reads: number
	engagement: number
	engagementRate: number | null
	updatedAt?: string
}

export type SelfMediaOpsOverviewActionKey =
	| "bind-source"
	| "sync-metrics"
	| "collect-comments"
	| "generate-review"
	| "improve-weak-post"

export interface SelfMediaOpsOverviewAction {
	key: SelfMediaOpsOverviewActionKey
	postKey: string
	title: string
	description: string
	cta: string
	priority: number
}

export interface SelfMediaOpsOverview {
	totalPosts: number
	totalReads: number
	totalEngagement: number
	engagementRate: number | null
	completion: Record<keyof SelfMediaPostOpsArtifacts, SelfMediaOpsOverviewCompletionItem>
	bestPost: SelfMediaOpsOverviewPostSummary | null
	weakestPost: SelfMediaOpsOverviewPostSummary | null
	nextActions: SelfMediaOpsOverviewAction[]
	lastUpdatedAt?: string
}

const READ_KEYS = ["reads", "readCount", "read_count", "views", "viewCount", "impressions"]
const LIKE_KEYS = ["likes", "feedLikes", "likeCount", "like_count"]
const COMMENT_KEYS = ["comments", "commentCount", "comment_count"]
const SAVE_KEYS = ["saves", "favorites", "collects", "bookmarkCount"]
const SHARE_KEYS = ["shares", "shareCount", "share_count"]
const MAX_NEXT_ACTIONS = 4
const WEAK_ENGAGEMENT_RATE = 0.02

export function getSelfMediaPostKey(item: SelfMediaPlatformPostItem) {
	return `${item.platform}:${item.index}:${item.entry.entry}`
}

export function buildSelfMediaOpsOverview({
	posts,
	artifactsByPostKey,
	metricsByPostKey,
}: SelfMediaOpsOverviewInput): SelfMediaOpsOverview {
	const total = posts.length
	const completion: SelfMediaOpsOverview["completion"] = {
		source: { done: 0, total },
		metrics: { done: 0, total },
		comments: { done: 0, total },
		review: { done: 0, total },
	}
	const postSummaries: SelfMediaOpsOverviewPostSummary[] = []
	const nextActions: SelfMediaOpsOverviewAction[] = []
	let totalReads = 0
	let totalEngagement = 0
	let lastUpdatedAt: string | undefined

	posts.forEach((post) => {
		const postKey = getSelfMediaPostKey(post)
		const artifacts = artifactsByPostKey.get(postKey) ?? {
			source: false,
			metrics: false,
			comments: false,
			review: false,
		}
		Object.keys(completion).forEach((key) => {
			const artifactKey = key as keyof SelfMediaPostOpsArtifacts
			if (artifacts[artifactKey]) completion[artifactKey].done += 1
		})

		const metrics = metricsByPostKey.get(postKey) ?? null
		const reads = readMetricNumber(metrics, READ_KEYS) ?? 0
		const engagement =
			(readMetricNumber(metrics, LIKE_KEYS) ?? 0) +
			(readMetricNumber(metrics, COMMENT_KEYS) ?? 0) +
			(readMetricNumber(metrics, SAVE_KEYS) ?? 0) +
			(readMetricNumber(metrics, SHARE_KEYS) ?? 0)
		const engagementRate = reads > 0 ? engagement / reads : null
		const title = getPostTitle(post)
		totalReads += reads
		totalEngagement += engagement
		if (metrics?.updatedAt && (!lastUpdatedAt || metrics.updatedAt > lastUpdatedAt)) {
			lastUpdatedAt = metrics.updatedAt
		}

		if (metrics) {
			postSummaries.push({
				postKey,
				title,
				platform: post.platform,
				index: post.index,
				reads,
				engagement,
				engagementRate,
				updatedAt: metrics.updatedAt,
			})
		}

		const action = buildPrimaryActionForPost({ postKey, artifacts })
		if (action) nextActions.push(action)
	})

	const bestPost = pickBestPost(postSummaries)
	const weakestPost = pickWeakestPost(postSummaries)
	if (weakestPost && weakestPost.engagementRate !== null) {
		nextActions.push({
			key: "improve-weak-post",
			postKey: weakestPost.postKey,
			title: "优化低互动文章",
			description: `${weakestPost.title} 的互动率偏低，可以继续让运营助手拆解标题、封面和评论引导。`,
			cta: "去优化",
			priority: 50,
		})
	}

	return {
		totalPosts: total,
		totalReads,
		totalEngagement,
		engagementRate: totalReads > 0 ? totalEngagement / totalReads : null,
		completion,
		bestPost,
		weakestPost,
		nextActions: nextActions
			.sort((left, right) => left.priority - right.priority)
			.slice(0, MAX_NEXT_ACTIONS),
		lastUpdatedAt,
	}
}

export function formatSelfMediaCompactNumber(value: number) {
	if (value >= 10000) return `${trimNumber(value / 10000)}万`
	if (value >= 1000) return `${trimNumber(value / 1000)}k`
	return String(Math.round(value))
}

export function formatSelfMediaPercent(value: number | null) {
	if (value === null) return "—"
	return `${trimNumber(value * 100)}%`
}

function buildPrimaryActionForPost({
	postKey,
	artifacts,
}: {
	postKey: string
	artifacts: SelfMediaPostOpsArtifacts
}): SelfMediaOpsOverviewAction | null {
	if (!artifacts.source) {
		return {
			key: "bind-source",
			postKey,
			title: "绑定已发布链接",
			description: "这篇文章还没绑定发布链接。绑定后，系统才能同步真实阅读、点赞和评论数据。",
			cta: "去绑定",
			priority: 10,
		}
	}
	if (!artifacts.metrics) {
		return {
			key: "sync-metrics",
			postKey,
			title: "同步最新数据",
			description: "已检测到发布源。现在可以同步最新阅读、点赞、评论和转发数据。",
			cta: "去同步",
			priority: 20,
		}
	}
	if (!artifacts.comments) {
		return {
			key: "collect-comments",
			postKey,
			title: "补充评论反馈",
			description: "这篇文章还缺少评论样本。补齐后，复盘判断会更可靠。",
			cta: "补评论",
			priority: 30,
		}
	}
	if (!artifacts.review) {
		return {
			key: "generate-review",
			postKey,
			title: "生成运营复盘",
			description: "数据和评论已经准备好，可以沉淀复盘结论和下一步动作。",
			cta: "去复盘",
			priority: 40,
		}
	}
	return null
}

function pickBestPost(posts: SelfMediaOpsOverviewPostSummary[]) {
	return posts.reduce<SelfMediaOpsOverviewPostSummary | null>((best, item) => {
		if (!best) return item
		if ((item.engagementRate ?? 0) > (best.engagementRate ?? 0)) return item
		if (
			(item.engagementRate ?? 0) === (best.engagementRate ?? 0) &&
			item.engagement > best.engagement
		) {
			return item
		}
		return best
	}, null)
}

function pickWeakestPost(posts: SelfMediaOpsOverviewPostSummary[]) {
	return posts.reduce<SelfMediaOpsOverviewPostSummary | null>((weakest, item) => {
		if (item.reads <= 0 || item.engagementRate === null) return weakest
		if (item.engagementRate >= WEAK_ENGAGEMENT_RATE) return weakest
		if (!weakest) return item
		return item.engagementRate < (weakest.engagementRate ?? Number.POSITIVE_INFINITY)
			? item
			: weakest
	}, null)
}

function readMetricNumber(
	payload: SelfMediaPostOpsMetricsPayload | null,
	keys: string[],
): number | null {
	if (!payload) return null
	for (const key of keys) {
		const parsed = parseMetricNumber(payload.metrics[key])
		if (parsed !== null) return parsed
	}
	return null
}

function parseMetricNumber(
	value: SelfMediaPostOpsMetricsPayload["metrics"][string],
): number | null {
	if (value === null || value === undefined) return null
	if (typeof value === "number") return Number.isFinite(value) ? value : null
	if (typeof value === "object") return parseMetricNumber(value.value)
	const normalized = value.trim().replace(/,/g, "").toLowerCase()
	if (!normalized || normalized === "-") return null
	const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)(k|w|万)?$/)
	if (!match) return null
	const numeric = Number(match[1])
	if (!Number.isFinite(numeric)) return null
	const unit = match[2]
	if (unit === "k") return numeric * 1000
	if (unit === "w" || unit === "万") return numeric * 10000
	return numeric
}

function getPostTitle(item: SelfMediaPlatformPostItem) {
	return (
		item.post.meta.feedTitle ||
		item.post.meta.title ||
		item.entry.name ||
		`文章 ${item.index + 1}`
	)
}

function trimNumber(value: number) {
	const rounded = Math.round(value * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
