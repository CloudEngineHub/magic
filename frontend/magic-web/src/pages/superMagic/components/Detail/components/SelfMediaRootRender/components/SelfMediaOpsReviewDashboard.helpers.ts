import type { CSSProperties } from "react"
import type { ChartConfig } from "@/components/shadcn-ui/chart"
import type {
	SelfMediaPostOpsCommentsPayload,
	SelfMediaPostOpsMetricValue,
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsReviewPayload,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"

export interface SelfMediaOpsReviewData {
	source: SelfMediaPostOpsSourcePayload | null
	metrics: SelfMediaPostOpsMetricsPayload | null
	comments: SelfMediaPostOpsCommentsPayload | null
	reviewHtml: SelfMediaPostOpsReviewPayload | null
	reviewMarkdown: SelfMediaPostOpsReviewPayload | null
}

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface SelfMediaOpsReviewKpi {
	key: string
	label: string
	value: string
	hint: string
}

export interface SelfMediaOpsReviewBriefItem {
	label: string
	value: string
}

export interface SelfMediaOpsReviewTrendPoint {
	label: string
	reads: number | null
	shares: number | null
	saves: number | null
}

export interface SelfMediaOpsReviewImpactItem {
	key: string
	label: string
	value: number
}

export interface SelfMediaOpsReviewFunnelItem {
	key: string
	label: string
	value: string
	percent: number
	color: string
}

export const OPS_PALETTE = {
	ink: "#18181b",
	muted: "#71717a",
	warm: "#f8f8f9",
	line: "rgba(24,24,27,0.06)",
	source: "#ff776c",
	amber: "#d4ad00",
	lime: "#8ba320",
	green: "#59b981",
	blue: "#4f7cff",
	plum: "#8b5cf6",
} as const

export const REVIEW_DASHBOARD_STYLE = {
	"--ops-ink": OPS_PALETTE.ink,
	"--ops-muted": OPS_PALETTE.muted,
	"--ops-warm": OPS_PALETTE.warm,
	"--ops-line": OPS_PALETTE.line,
	"--ops-source": OPS_PALETTE.source,
	"--ops-amber": OPS_PALETTE.amber,
	"--ops-lime": OPS_PALETTE.lime,
	"--ops-green": OPS_PALETTE.green,
	"--ops-blue": OPS_PALETTE.blue,
	"--ops-plum": OPS_PALETTE.plum,
} as CSSProperties

export const trendChartConfig = {
	reads: {
		label: "Reads",
		color: OPS_PALETTE.ink,
	},
	shares: {
		label: "Shares",
		color: OPS_PALETTE.source,
	},
	saves: {
		label: "Saves",
		color: OPS_PALETTE.green,
	},
} satisfies ChartConfig

export const impactChartConfig = {
	value: {
		label: "Value",
		color: OPS_PALETTE.ink,
	},
} satisfies ChartConfig

export const QUALITY_COLORS = [
	OPS_PALETTE.ink,
	OPS_PALETTE.source,
	OPS_PALETTE.green,
	OPS_PALETTE.amber,
]

export function buildKpis(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
): SelfMediaOpsReviewKpi[] {
	const metrics = payload?.metrics ?? {}
	const derived = payload?.derivedMetrics ?? {}
	return [
		{
			key: "reads",
			label: t("detail.selfMedia.opsMetrics.fields.reads"),
			value: valueOf(metrics.reads),
			hint: t("detail.selfMedia.opsReview.kpiHints.reach"),
		},
		{
			key: "likes",
			label: t("detail.selfMedia.opsMetrics.fields.likes"),
			value: valueOf(metrics.likes),
			hint: t("detail.selfMedia.opsReview.kpiHints.preference"),
		},
		{
			key: "shares",
			label: t("detail.selfMedia.opsMetrics.fields.shares"),
			value: valueOf(metrics.shares),
			hint: t("detail.selfMedia.opsReview.kpiHints.spread"),
		},
		{
			key: "saves",
			label: t("detail.selfMedia.opsMetrics.fields.saves"),
			value: valueOf(metrics.saves ?? metrics.collects),
			hint: t("detail.selfMedia.opsReview.kpiHints.intent"),
		},
		{
			key: "engagementRate",
			label: t("detail.selfMedia.opsReview.engagementRate"),
			value: valueOf(derived.engagementRate),
			hint: t("detail.selfMedia.opsReview.kpiHints.efficiency"),
		},
	]
}

export function buildTrendData(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
): SelfMediaOpsReviewTrendPoint[] {
	const source = payload?.history?.length
		? payload.history
		: payload
			? [{ fetchedAt: payload.updatedAt, metrics: payload.metrics }]
			: []
	return source.map((item, index) => ({
		label: formatShortTime(item?.fetchedAt ?? "", index),
		reads: numberOf(item.metrics?.reads),
		shares: numberOf(item.metrics?.shares),
		saves: numberOf(item.metrics?.saves ?? item.metrics?.collects),
	}))
}

export function buildImpactData(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
): SelfMediaOpsReviewImpactItem[] {
	const metrics = payload?.metrics ?? {}
	return [
		{
			key: "likes",
			label: t("detail.selfMedia.opsMetrics.fields.likes"),
			value: numberOf(metrics.likes),
		},
		{
			key: "saves",
			label: t("detail.selfMedia.opsMetrics.fields.saves"),
			value: numberOf(metrics.saves ?? metrics.collects),
		},
		{
			key: "shares",
			label: t("detail.selfMedia.opsMetrics.fields.shares"),
			value: numberOf(metrics.shares),
		},
		{
			key: "comments",
			label: t("detail.selfMedia.opsMetrics.fields.comments"),
			value: numberOf(metrics.comments),
		},
	].filter((item): item is SelfMediaOpsReviewImpactItem => item.value !== null)
}

export function buildQualityData(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
) {
	return buildImpactData(payload, t).filter((item) => item.value > 0)
}

export function buildFunnelItems(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	t: Translate,
): SelfMediaOpsReviewFunnelItem[] {
	const metrics = payload?.metrics ?? {}
	const reads = numberOf(metrics.reads) ?? 0
	const likes = numberOf(metrics.likes) ?? 0
	const saves = numberOf(metrics.saves ?? metrics.collects) ?? 0
	const shares = numberOf(metrics.shares) ?? 0
	const comments = numberOf(metrics.comments) ?? 0
	const intent = saves + comments + shares
	const engagement = likes + intent
	const max = Math.max(reads, engagement, intent, 1)
	return [
		{
			key: "reach",
			label: t("detail.selfMedia.opsReview.funnel.reach"),
			value: reads ? String(reads) : "--",
			percent: Math.max(8, Math.round((reads / max) * 100)),
			color: OPS_PALETTE.ink,
		},
		{
			key: "engagement",
			label: t("detail.selfMedia.opsReview.funnel.engagement"),
			value: engagement ? String(engagement) : "--",
			percent: Math.max(8, Math.round((engagement / max) * 100)),
			color: OPS_PALETTE.source,
		},
		{
			key: "intent",
			label: t("detail.selfMedia.opsReview.funnel.intent"),
			value: intent ? String(intent) : "--",
			percent: Math.max(8, Math.round((intent / max) * 100)),
			color: OPS_PALETTE.green,
		},
	]
}

export function buildBriefItems(
	data: SelfMediaOpsReviewData | null,
	readsDelta: number | null,
	t: Translate,
): SelfMediaOpsReviewBriefItem[] {
	const metrics = data?.metrics?.metrics ?? {}
	const derived = data?.metrics?.derivedMetrics ?? {}
	const comments = data?.comments?.comments ?? []
	const consultationCount = comments.filter((comment) =>
		`${comment.intent ?? ""} ${comment.text}`.includes("咨询"),
	).length
	return [
		{
			label: t("detail.selfMedia.opsReview.brief.reachTrend"),
			value:
				readsDelta === null
					? "--"
					: readsDelta >= 0
						? `+${readsDelta}`
						: String(readsDelta),
		},
		{
			label: t("detail.selfMedia.opsReview.brief.efficiency"),
			value: valueOf(derived.engagementRate),
		},
		{
			label: t("detail.selfMedia.opsReview.brief.intent"),
			value:
				consultationCount > 0
					? t("detail.selfMedia.opsReview.brief.consulting", {
							count: consultationCount,
						})
					: valueOf(metrics.saves ?? metrics.collects),
		},
	]
}

export function buildActionItems(data: SelfMediaOpsReviewData | null) {
	const insights = data?.comments?.insights?.filter(Boolean) ?? []
	if (insights.length > 0) return insights.slice(0, 4)
	const summary = data?.comments?.summary?.trim()
	if (summary) return [summary]
	return [
		"复用高互动标题结构，补充更具体的使用场景。",
		"把评论区问题整理成下一篇的开头钩子。",
		"同步观察收藏和转发变化，判断内容是否具备二次传播价值。",
	]
}

export function computeLatestDelta(
	payload: SelfMediaPostOpsMetricsPayload | null | undefined,
	key: string,
): number | null {
	if (!payload?.history || payload.history.length < 2) return null
	const previous = payload.history[payload.history.length - 2]
	const latest = payload.history[payload.history.length - 1]
	const previousValue = numberOf(previous?.metrics?.[key])
	const latestValue = numberOf(latest?.metrics?.[key])
	if (previousValue === null || latestValue === null) return null
	return latestValue - previousValue
}

export function resolveReviewHtmlRelativePath(postEntryPath?: string) {
	const normalized = (postEntryPath || "").replace(/^\/+/, "")
	const postDir = normalized.endsWith("/post.json")
		? normalized.slice(0, -"post.json".length)
		: normalized.replace(/[^/]*$/, "")

	return `${postDir}ops/review.html`
}

function valueOf(value: SelfMediaPostOpsMetricValue | undefined) {
	if (value === null || value === undefined || value === "") return "--"
	if (typeof value === "object") return valueOf(value.value)
	return String(value)
}

function numberOf(value: SelfMediaPostOpsMetricValue | undefined): number | null {
	const raw = valueOf(value)
	if (raw === "--") return null
	const normalized = raw.replace(/,/g, "").trim()
	const multiplier = /w|万/i.test(normalized) ? 10000 : 1
	const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""))
	return Number.isFinite(parsed) ? Math.round(parsed * multiplier) : null
}

function formatShortTime(value: string, index: number) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return `#${index + 1}`
	return `${date.getMonth() + 1}/${date.getDate()}`
}
