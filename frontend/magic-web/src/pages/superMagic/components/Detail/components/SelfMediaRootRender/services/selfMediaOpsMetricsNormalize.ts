import type {
	SelfMediaPostOpsMetricsHistoryItem,
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsMetricValue,
} from "./SelfMediaFileStorageService"

export function normalizePostOpsMetricsPayload(payload: unknown): SelfMediaPostOpsMetricsPayload {
	const record = isRecord(payload) ? payload : {}
	const rawMetrics = isRecord(record.metrics) ? record.metrics : {}
	const source = normalizeOpsMetricsSource(record.source, record.dataSource)
	const metrics = hasGroupedOpsMetrics(rawMetrics)
		? buildFixedMetricsFromGrouped(rawMetrics)
		: buildFixedMetricsFromFlat(rawMetrics)
	const derivedMetrics = hasGroupedOpsMetrics(rawMetrics)
		? buildFixedDerivedMetricsFromGrouped(rawMetrics)
		: buildFixedDerivedMetricsFromFlat(
				isRecord(record.derivedMetrics) ? record.derivedMetrics : {},
			)
	const updatedAt =
		typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
	const history = Array.isArray(record.history)
		? record.history.map((item, index) =>
				normalizePostOpsMetricsHistoryItem(item, source, updatedAt, index),
			)
		: undefined
	const notes = buildNormalizedOpsMetricsNotes(record)

	return {
		version: typeof record.version === "number" ? record.version : 1,
		updatedAt,
		source,
		metrics,
		...(Object.keys(derivedMetrics).length > 0 ? { derivedMetrics } : {}),
		...(notes ? { notes } : {}),
		...(history?.length ? { history } : {}),
	}
}

function normalizePostOpsMetricsHistoryItem(
	item: unknown,
	source: SelfMediaPostOpsMetricsPayload["source"],
	updatedAt: string,
	index: number,
): SelfMediaPostOpsMetricsHistoryItem {
	const record = isRecord(item) ? item : {}
	const rawMetrics = isRecord(record.metrics) ? record.metrics : record
	const rawDerived = isRecord(record.derivedMetrics) ? record.derivedMetrics : record
	return {
		fetchedAt:
			typeof record.fetchedAt === "string"
				? record.fetchedAt
				: typeof record.updatedAt === "string"
					? record.updatedAt
					: `${updatedAt}#${index}`,
		metrics: buildFixedMetricsFromFlat(rawMetrics),
		derivedMetrics: buildFixedDerivedMetricsFromFlat(rawDerived),
		source,
		...(typeof record.note === "string" ? { note: record.note } : {}),
	}
}

function hasGroupedOpsMetrics(metrics: Record<string, unknown>) {
	return (
		isRecord(metrics.reach) ||
		isRecord(metrics.engagement) ||
		isRecord(metrics.conversion) ||
		isRecord(metrics.ratios)
	)
}

function buildFixedMetricsFromGrouped(metrics: Record<string, unknown>) {
	const reach = isRecord(metrics.reach) ? metrics.reach : {}
	const engagement = isRecord(metrics.engagement) ? metrics.engagement : {}
	const conversion = isRecord(metrics.conversion) ? metrics.conversion : {}
	return compactMetricRecord({
		reads: firstMetricValue(engagement.reads, reach.impressions, reach.uniqueReaders),
		likes: firstMetricValue(engagement.likes),
		saves: firstMetricValue(engagement.saves, engagement.collects),
		comments: firstMetricValue(engagement.comments),
		shares: firstMetricValue(engagement.shares),
		follows: firstMetricValue(conversion.follows, conversion.newFollowers),
		conversions: firstMetricValue(conversion.conversions, conversion.signups),
	})
}

function buildFixedMetricsFromFlat(metrics: Record<string, unknown>) {
	return compactMetricRecord({
		reads: firstMetricValue(metrics.reads, metrics.impressions, metrics.uniqueReaders),
		likes: firstMetricValue(metrics.likes),
		saves: firstMetricValue(metrics.saves, metrics.collects),
		comments: firstMetricValue(metrics.comments),
		shares: firstMetricValue(metrics.shares),
		follows: firstMetricValue(metrics.follows, metrics.newFollowers),
		conversions: firstMetricValue(metrics.conversions, metrics.signups),
	})
}

function buildFixedDerivedMetricsFromGrouped(metrics: Record<string, unknown>) {
	const engagement = isRecord(metrics.engagement) ? metrics.engagement : {}
	const conversion = isRecord(metrics.conversion) ? metrics.conversion : {}
	const ratios = isRecord(metrics.ratios) ? metrics.ratios : {}
	return compactMetricRecord({
		engagementRate: percentMetricValue(engagement.engagementRate),
		saveRate: percentMetricValue(firstMetricValue(ratios.saveRate, ratios.collectRate)),
		shareRate: percentMetricValue(ratios.shareRate),
		commentRate: percentMetricValue(ratios.commentRate),
		followRate: percentMetricValue(conversion.followConversionRate),
		conversionRate: percentMetricValue(
			firstMetricValue(conversion.conversionRate, conversion.signupConversionRate),
		),
	})
}

function buildFixedDerivedMetricsFromFlat(metrics: Record<string, unknown>) {
	return compactMetricRecord({
		engagementRate: percentMetricValue(metrics.engagementRate),
		saveRate: percentMetricValue(firstMetricValue(metrics.saveRate, metrics.collectRate)),
		shareRate: percentMetricValue(metrics.shareRate),
		commentRate: percentMetricValue(metrics.commentRate),
		followRate: percentMetricValue(metrics.followRate),
		conversionRate: percentMetricValue(metrics.conversionRate),
	})
}

function compactMetricRecord(values: Record<string, SelfMediaPostOpsMetricValue | undefined>) {
	return Object.fromEntries(
		Object.entries(values).filter(([, value]) => value !== undefined),
	) as Record<string, SelfMediaPostOpsMetricValue>
}

function firstMetricValue(...values: unknown[]): SelfMediaPostOpsMetricValue | undefined {
	for (const value of values) {
		if (isMetricValue(value)) return value
	}
	return undefined
}

function percentMetricValue(value: SelfMediaPostOpsMetricValue | undefined) {
	if (value === undefined || value === null || value === "") return undefined
	if (typeof value === "number") return `${value}%`
	if (typeof value === "string") return value.endsWith("%") ? value : `${value}%`
	if (typeof value === "object") {
		return {
			...value,
			value: percentMetricValue(value.value) ?? null,
		}
	}
	return undefined
}

function isMetricValue(value: unknown): value is SelfMediaPostOpsMetricValue {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		(isRecord(value) && ("value" in value || "label" in value))
	)
}

function normalizeOpsMetricsSource(
	source: unknown,
	dataSource: unknown,
): SelfMediaPostOpsMetricsPayload["source"] {
	if (
		source === "real-platform" ||
		source === "user" ||
		source === "reference" ||
		source === "generated" ||
		source === "mixed"
	) {
		return source
	}
	return typeof dataSource === "string" && dataSource ? "real-platform" : "user"
}

function buildNormalizedOpsMetricsNotes(record: Record<string, unknown>) {
	const notes = typeof record.notes === "string" ? record.notes.trim() : ""
	const extras = [
		typeof record.platform === "string" ? `platform=${record.platform}` : "",
		typeof record.dataSource === "string" ? `dataSource=${record.dataSource}` : "",
	]
		.filter(Boolean)
		.join("; ")
	return [notes, extras].filter(Boolean).join("\n")
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
