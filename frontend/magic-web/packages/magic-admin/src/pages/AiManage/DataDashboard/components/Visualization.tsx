import { Empty, Progress, Spin } from "antd"
import {
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ResponsiveContainer,
	Tooltip as RechartsTooltip,
	XAxis,
	YAxis,
} from "recharts"
import type { DataDashboard } from "@admin/types/datadashboard"
import {
	BUCKET_TONE,
	CHART_COLORS,
	CHART_MAX_BAR_SIZE,
	CHART_SERIES,
	MAX_PROGRESS_PERCENT,
	RATIO_BASE,
	TREND_DATA_KEY,
	USAGE_THRESHOLD,
	VIEW,
	type ChartSeries,
	type DataDashboardView,
} from "../consts"
import type { DashboardT } from "../types"
import { formatNumber, formatPercent, safeDivide } from "../utils"

interface TrendPoint {
	period: string
	calls: number
	activeAgents: number
	activeMembers: number
}

interface BucketItem {
	name: string
	meta: string
	value: number
	tone: string
}

export function Visualization({
	view,
	agentSummary,
	memberSummary,
	loading,
	styles,
	t,
}: {
	view: DataDashboardView
	agentSummary: DataDashboard.AgentSummary | null
	memberSummary: DataDashboard.MemberSummary | null
	loading: boolean
	styles: Record<string, string>
	t: DashboardT
}) {
	if (view === VIEW.DigitalEmployeeAnalysis) {
		const trend = buildAgentTrend(agentSummary)
		return (
			<div className={styles.analysisGrid}>
				<ChartPanel
					title={t("charts.agentTrend")}
					desc={t("charts.agentTrendDesc")}
					data={trend}
					series={CHART_SERIES.Agent}
					loading={loading}
					styles={styles}
					t={t}
				/>
				<BucketPanel
					title={t("charts.agentBucket")}
					items={buildAgentBucketItems(agentSummary, t)}
					total={agentSummary?.agent_total ?? 0}
					loading={loading}
					styles={styles}
				/>
			</div>
		)
	}

	if (view === VIEW.MemberAnalysis) {
		const trend = buildMemberTrend(memberSummary)
		return (
			<div className={styles.analysisGrid}>
				<ChartPanel
					title={t("charts.memberTrend")}
					desc={t("charts.memberTrendDesc")}
					data={trend}
					series={CHART_SERIES.Member}
					loading={loading}
					styles={styles}
					t={t}
				/>
				<BucketPanel
					title={t("charts.memberBucket")}
					items={buildMemberBucketItems(memberSummary, t)}
					total={memberSummary?.employed_member_count ?? 0}
					loading={loading}
					styles={styles}
				/>
			</div>
		)
	}

	return null
}

function buildAgentTrend(summary: DataDashboard.AgentSummary | null): TrendPoint[] {
	return (
		summary?.usage_trend.map((item) => ({
			period: item.date,
			calls: item.call_count,
			activeAgents: item.active_agent_count,
			activeMembers: 0,
		})) ?? []
	)
}

function buildMemberTrend(summary: DataDashboard.MemberSummary | null): TrendPoint[] {
	return (
		summary?.usage_trend.map((item) => ({
			period: item.date,
			calls: item.call_count,
			activeAgents: 0,
			activeMembers: item.active_member_count,
		})) ?? []
	)
}

function buildAgentBucketItems(
	summary: DataDashboard.AgentSummary | null,
	t: DashboardT,
): BucketItem[] {
	const high = sumAgentDistribution(
		summary,
		(callCount) => callCount >= USAGE_THRESHOLD.AgentHighCalls,
	)
	const stable = sumAgentDistribution(
		summary,
		(callCount) =>
			callCount >= USAGE_THRESHOLD.AgentStableCalls &&
			callCount < USAGE_THRESHOLD.AgentHighCalls,
	)
	const low = sumAgentDistribution(
		summary,
		(callCount) => callCount > 0 && callCount < USAGE_THRESHOLD.AgentStableCalls,
	)
	const unused = Math.max((summary?.agent_total ?? 0) - (summary?.active_agent_count ?? 0), 0)

	return [
		{
			name: t("buckets.highUseAgent"),
			meta: t("buckets.highUseAgentDesc"),
			value: high,
			tone: BUCKET_TONE.High,
		},
		{
			name: t("buckets.stableUseAgent"),
			meta: t("buckets.stableUseAgentDesc"),
			value: stable,
			tone: BUCKET_TONE.Stable,
		},
		{
			name: t("buckets.lowUseAgent"),
			meta: t("buckets.lowUseAgentDesc"),
			value: low,
			tone: BUCKET_TONE.Low,
		},
		{
			name: t("buckets.unusedAgent"),
			meta: t("buckets.unusedAgentDesc"),
			value: unused,
			tone: BUCKET_TONE.Unused,
		},
	]
}

function buildMemberBucketItems(
	summary: DataDashboard.MemberSummary | null,
	t: DashboardT,
): BucketItem[] {
	const high = sumMemberDistribution(
		summary,
		(usageDays) => usageDays >= USAGE_THRESHOLD.MemberHighUsageDays,
	)
	const stable = sumMemberDistribution(
		summary,
		(usageDays) =>
			usageDays >= USAGE_THRESHOLD.MemberStableUsageDays &&
			usageDays < USAGE_THRESHOLD.MemberHighUsageDays,
	)
	const light = sumMemberDistribution(
		summary,
		(usageDays) => usageDays === USAGE_THRESHOLD.MemberLightUsageDays,
	)
	const silent = Math.max(
		(summary?.employed_member_count ?? 0) - (summary?.active_member_count ?? 0),
		0,
	)

	return [
		{
			name: t("buckets.highUseMember"),
			meta: t("buckets.highUseMemberDesc"),
			value: high,
			tone: BUCKET_TONE.High,
		},
		{
			name: t("buckets.stableUseMember"),
			meta: t("buckets.stableUseMemberDesc"),
			value: stable,
			tone: BUCKET_TONE.Stable,
		},
		{
			name: t("buckets.lightUseMember"),
			meta: t("buckets.lightUseMemberDesc"),
			value: light,
			tone: BUCKET_TONE.Low,
		},
		{
			name: t("buckets.silentMember"),
			meta: t("buckets.silentMemberDesc"),
			value: silent,
			tone: BUCKET_TONE.Unused,
		},
	]
}

function sumAgentDistribution(
	summary: DataDashboard.AgentSummary | null,
	matcher: (callCount: number) => boolean,
) {
	return (
		summary?.call_distribution.reduce(
			(total, item) => total + (matcher(item.call_count) ? item.agent_count : 0),
			0,
		) ?? 0
	)
}

function sumMemberDistribution(
	summary: DataDashboard.MemberSummary | null,
	matcher: (usageDays: number) => boolean,
) {
	return (
		summary?.usage_days_distribution.reduce(
			(total, item) => total + (matcher(item.usage_days) ? item.member_count : 0),
			0,
		) ?? 0
	)
}

function ChartPanel({
	title,
	desc,
	data,
	series,
	loading,
	styles,
	t,
}: {
	title: string
	desc: string
	data: TrendPoint[]
	series: ChartSeries
	loading: boolean
	styles: Record<string, string>
	t: DashboardT
}) {
	const activeDataKey =
		series === CHART_SERIES.Agent ? TREND_DATA_KEY.ActiveAgents : TREND_DATA_KEY.ActiveMembers
	const hasData = data.some(
		(item) => item.calls > 0 || item.activeAgents > 0 || item.activeMembers > 0,
	)

	return (
		<section className={styles.panel}>
			<div className={styles.cardHeader}>
				<div>
					<h2 className={styles.cardTitle}>{title}</h2>
					<div className={styles.cardDesc}>{desc}</div>
				</div>
			</div>
			<Spin spinning={loading}>
				<div className={`${styles.chartBox} ${!hasData && !loading && styles.empty}`}>
					{hasData ? (
						<ResponsiveContainer>
							<ComposedChart data={data}>
								<CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
								<XAxis
									dataKey={TREND_DATA_KEY.Period}
									tick={{ fontSize: 12, fill: "#8c8c8c" }}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									yAxisId="left"
									tick={{ fontSize: 12, fill: "#8c8c8c" }}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									tick={{ fontSize: 12, fill: "#8c8c8c" }}
									tickLine={false}
									axisLine={false}
								/>
								<RechartsTooltip
									contentStyle={{
										background: "rgba(17, 24, 39, 0.92)",
										border: "none",
										borderRadius: 8,
										color: "#fff",
										fontSize: 13,
									}}
									formatter={(value) => formatNumber(Number(value))}
								/>
								<Legend
									iconSize={10}
									wrapperStyle={{ color: "#8c8c8c", fontSize: 13 }}
								/>
								<Line
									yAxisId="right"
									type="monotone"
									dataKey={activeDataKey}
									name={
										series === CHART_SERIES.Agent
											? t("columns.activeAgents")
											: t("columns.activeMembers")
									}
									stroke={
										series === CHART_SERIES.Agent
											? CHART_COLORS.activeAgents
											: CHART_COLORS.activeMembers
									}
									strokeWidth={2}
									dot={{ r: 3, strokeWidth: 2 }}
								/>
								<Bar
									yAxisId="left"
									dataKey={TREND_DATA_KEY.Calls}
									name={t("columns.calls")}
									fill={CHART_COLORS.calls}
									maxBarSize={CHART_MAX_BAR_SIZE}
									radius={[4, 4, 0, 0]}
								/>
							</ComposedChart>
						</ResponsiveContainer>
					) : loading ? null : (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
					)}
				</div>
			</Spin>
		</section>
	)
}

function BucketPanel({
	title,
	items,
	total,
	loading,
	styles,
}: {
	title: string
	items: BucketItem[]
	total: number
	loading: boolean
	styles: Record<string, string>
}) {
	return (
		<section className={styles.panel}>
			<div className={styles.cardHeader}>
				<div>
					<h2 className={styles.cardTitle}>{title}</h2>
				</div>
			</div>
			<Spin spinning={loading}>
				<div className={styles.rankingList}>
					{items.map((item) => {
						const ratio = safeDivide(item.value, total)
						const percent = ratio * RATIO_BASE
						return (
							<div key={item.name} className={styles.rankingItem}>
								<div>
									<div className={styles.rankingName}>{item.name}</div>
									<div className={styles.rankingMeta}>{item.meta}</div>
								</div>
								<div className={styles.rankingValueBlock}>
									<div className={styles.rankingValue}>
										{formatNumber(item.value)}
									</div>
									<div className={styles.rankingPercent}>
										{formatPercent(ratio)}
									</div>
								</div>
								<Progress
									className={styles.progressLine}
									showInfo={false}
									percent={Math.min(percent, MAX_PROGRESS_PERCENT)}
									strokeColor={item.tone}
									size="small"
								/>
							</div>
						)
					})}
				</div>
			</Spin>
		</section>
	)
}
