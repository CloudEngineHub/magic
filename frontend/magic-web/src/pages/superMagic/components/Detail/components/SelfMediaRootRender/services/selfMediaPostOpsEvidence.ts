import type {
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsMetricValue,
} from "./SelfMediaFileStorageService"
import type { SelfMediaPostOpsArtifacts } from "./selfMediaOpsArtifactStates"

interface BuildDisplayedSelfMediaPostOpsArtifactsByPostKeyOptions {
	artifactsByPostKey: Map<string, SelfMediaPostOpsArtifacts>
	metricsByPostKey: Map<string, SelfMediaPostOpsMetricsPayload | null>
	publishedUrlsByPostKey: Map<string, string>
}

export function deriveOpsArtifacts(
	artifacts: SelfMediaPostOpsArtifacts,
	opsMetrics?: SelfMediaPostOpsMetricsPayload | null,
	publishedUrl?: string,
): SelfMediaPostOpsArtifacts {
	const hasLoadedMetrics = hasSelfMediaPostOpsMetricValues(opsMetrics)
	const hasPublishedUrl = Boolean(publishedUrl?.trim())
	const hasDownstreamArtifacts = artifacts.metrics || artifacts.comments || artifacts.review
	if (!hasPublishedUrl && !hasLoadedMetrics && !hasDownstreamArtifacts) return artifacts

	return {
		...artifacts,
		source: true,
		metrics: artifacts.metrics || hasLoadedMetrics,
	}
}

export function buildDisplayedSelfMediaPostOpsArtifactsByPostKey({
	artifactsByPostKey,
	metricsByPostKey,
	publishedUrlsByPostKey,
}: BuildDisplayedSelfMediaPostOpsArtifactsByPostKeyOptions) {
	const displayedArtifactsByPostKey = new Map<string, SelfMediaPostOpsArtifacts>()
	artifactsByPostKey.forEach((artifacts, postKey) => {
		displayedArtifactsByPostKey.set(
			postKey,
			deriveOpsArtifacts(
				artifacts,
				metricsByPostKey.get(postKey),
				publishedUrlsByPostKey.get(postKey),
			),
		)
	})
	return displayedArtifactsByPostKey
}

function hasSelfMediaPostOpsMetricValues(opsMetrics?: SelfMediaPostOpsMetricsPayload | null) {
	return hasMetricValues(opsMetrics?.metrics) || hasMetricValues(opsMetrics?.derivedMetrics)
}

function hasMetricValues(metrics?: Record<string, SelfMediaPostOpsMetricValue>) {
	if (!metrics) return false
	return Object.values(metrics).some(hasMetricValue)
}

function hasMetricValue(value: SelfMediaPostOpsMetricValue | undefined): boolean {
	if (typeof value === "string") return value.trim().length > 0
	if (typeof value === "number") return Number.isFinite(value)
	if (value && typeof value === "object") return hasMetricValue(value.value)
	return false
}
