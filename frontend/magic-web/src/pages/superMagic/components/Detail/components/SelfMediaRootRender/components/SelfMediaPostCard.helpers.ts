import { BarChart3, ClipboardCheck, Eye, Link2, MessageCircle, ThumbsUp } from "lucide-react"
import type {
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsMetricValue,
} from "../services/SelfMediaFileStorageService"
import type { SelfMediaPostOpsArtifacts } from "../services/selfMediaOpsArtifactStates"

export function getEngagementItems(opsMetrics?: SelfMediaPostOpsMetricsPayload | null) {
	const items: Array<{
		key: string
		labelKey: string
		value: string
		Icon: typeof ThumbsUp
	}> = []
	const reads = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"reads",
		"readCount",
		"read_count",
		"viewCount",
		"views",
		"view_count",
	])
	const likes = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"likes",
		"feedLikes",
		"likeCount",
		"like_count",
	])
	const comments = getOpsMetricDisplayValue(opsMetrics?.metrics, [
		"comments",
		"commentCount",
		"commentsCount",
		"comment_count",
	])

	if (reads) {
		items.push({
			key: "reads",
			labelKey: "detail.selfMedia.home.engagement.reads",
			value: reads,
			Icon: Eye,
		})
	}
	if (likes) {
		items.push({
			key: "likes",
			labelKey: "detail.selfMedia.home.engagement.likes",
			value: likes,
			Icon: ThumbsUp,
		})
	}
	if (comments) {
		items.push({
			key: "comments",
			labelKey: "detail.selfMedia.home.engagement.comments",
			value: comments,
			Icon: MessageCircle,
		})
	}
	return items
}

function getOpsMetricDisplayValue(
	metrics: Record<string, SelfMediaPostOpsMetricValue> | undefined,
	keys: string[],
) {
	if (!metrics) return ""
	for (const key of keys) {
		const displayValue = normalizeMetricDisplayValue(metrics[key])
		if (displayValue) return displayValue
	}
	return ""
}

function normalizeMetricDisplayValue(value: SelfMediaPostOpsMetricValue | undefined) {
	if (typeof value === "string") {
		const trimmed = value.trim()
		if (trimmed) return trimmed
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value)
	}
	if (value && typeof value === "object") {
		return normalizeMetricDisplayValue(value.value)
	}
	return ""
}

export function getOpsArtifactItems(artifacts: SelfMediaPostOpsArtifacts) {
	return [
		{
			key: "source",
			Icon: Link2,
			ready: artifacts.source,
			readyClassName: "bg-[#ff776c]/10 text-[#ff776c]",
			labelKey: artifacts.source
				? "detail.selfMedia.home.opsArtifacts.sourceReady"
				: "detail.selfMedia.home.opsArtifacts.sourceMissing",
		},
		{
			key: "metrics",
			Icon: BarChart3,
			ready: artifacts.metrics,
			readyClassName: "bg-[#ffd637]/20 text-[#d4ad00]",
			labelKey: artifacts.metrics
				? "detail.selfMedia.home.opsArtifacts.metricsReady"
				: "detail.selfMedia.home.opsArtifacts.metricsMissing",
		},
		{
			key: "comments",
			Icon: MessageCircle,
			ready: artifacts.comments,
			readyClassName: "bg-[#cdeb55]/20 text-[#8ba320]",
			labelKey: artifacts.comments
				? "detail.selfMedia.home.opsArtifacts.commentsReady"
				: "detail.selfMedia.home.opsArtifacts.commentsMissing",
		},
		{
			key: "review",
			Icon: ClipboardCheck,
			ready: artifacts.review,
			readyClassName: "bg-[#18181b]/10 text-[#18181b]",
			labelKey: artifacts.review
				? "detail.selfMedia.home.opsArtifacts.reviewReady"
				: "detail.selfMedia.home.opsArtifacts.reviewMissing",
		},
	]
}
