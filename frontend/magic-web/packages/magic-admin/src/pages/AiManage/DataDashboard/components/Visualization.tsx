import { type CSSProperties, useMemo, useState } from "react"
import { Checkbox, Empty, Progress, Segmented, Spin } from "antd"
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
	CHART_AXIS,
	CHART_AXIS_IDS,
	CHART_COLORS,
	CHART_MAX_BAR_SIZE,
	CHART_METRIC_TYPE,
	DEPARTMENT_LEVEL_TAG_MAP,
	EMPTY_CHART_AXIS_LABELS,
	MAX_PROGRESS_PERCENT,
	RATIO_BASE,
	TREND_DATA_KEY,
	USAGE_THRESHOLD,
	VIEW,
	type ChartAxisId,
	type ChartMetricType,
	type DataDashboardView,
} from "../consts"
import type { DashboardT } from "../types"
import {
	displayText,
	fillConsumptionTrend,
	formatNumber,
	formatPercent,
	safeDivide,
} from "../utils"

interface TrendPoint {
	period: string
	calls: number
	amount: number
	tokens: number
	activeAgents: number
	activeMembers: number
}

interface BucketItem {
	name: string
	meta: string
	value: number
	tone: string
}

type TrendMetricKey = Exclude<keyof TrendPoint, "period">

interface ChartMetricConfig {
	/** 数据字段 */
	dataKey: TrendMetricKey
	/** 指标标签 */
	label: string
	/** 图表类型 */
	chartType: ChartMetricType
	/** 坐标轴ID */
	yAxisId: ChartAxisId
	/* 颜色 */
	color: string
}

type ChartAxisLabels = Partial<Record<ChartAxisId, string>>

const DEPARTMENT_RANK_TONES = [
	{ color: "#d97706", background: "#fff3d6" },
	{ color: "#52677f", background: "#edf3f8" },
	{ color: "#e05b28", background: "#fff0e8" },
	{ color: "#7f8790", background: "#f3f4f6" },
] as const

type VisualizationSummary =
	| DataDashboard.AgentSummary
	| DataDashboard.MemberSummary
	| DataDashboard.OrganizationSummary
	| DataDashboard.ConsumptionAnalysisSummary
	| null

interface VisualizationProps {
	/** 当前展示的数据看板视图 */
	view: DataDashboardView
	/** 当前视图对应的汇总数据 */
	summary: VisualizationSummary
	/** 汇总数据是否正在加载 */
	loading: boolean
	/** 数据看板样式类名集合 */
	styles: Record<string, string>
	/** 数据看板国际化函数 */
	t: DashboardT
	/** 当前筛选的开始和结束日期 */
	dateQuery: Pick<DataDashboard.BaseQuery, "start_date" | "end_date">
}
export function Visualization({
	view,
	summary,
	loading,
	styles,
	t,
	dateQuery,
}: VisualizationProps) {
	if (view === VIEW.DigitalEmployeeAnalysis) {
		const agentSummary = summary as DataDashboard.AgentSummary | null
		const trend = buildAgentTrend(agentSummary)
		return (
			<div className={styles.analysisGrid}>
				<ChartPanel
					key={VIEW.DigitalEmployeeAnalysis}
					title={t("charts.agentTrend")}
					desc={t("charts.agentTrendDesc")}
					data={trend}
					metrics={getAgentTrendMetrics(t)}
					axisLabels={{
						left: t("charts.callsAxis"),
						right: t("charts.activeAxis"),
					}}
					loading={loading}
					styles={styles}
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
		const memberSummary = summary as DataDashboard.MemberSummary | null
		const trend = buildMemberTrend(memberSummary)
		return (
			<div className={styles.analysisGrid}>
				<ChartPanel
					key={VIEW.MemberAnalysis}
					title={t("charts.memberTrend")}
					desc={t("charts.memberTrendDesc")}
					data={trend}
					metrics={getMemberTrendMetrics(t)}
					axisLabels={{ left: t("charts.quantityAxis") }}
					loading={loading}
					styles={styles}
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

	if (view === VIEW.OrganizationAnalysis) {
		const organizationSummary = summary as DataDashboard.OrganizationSummary | null
		return (
			<div className={styles.analysisGrid}>
				<DepartmentPenetrationPanel
					summary={organizationSummary}
					loading={loading}
					styles={styles}
					t={t}
				/>
				<BucketPanel
					title={t("charts.departmentUsage")}
					items={buildDepartmentBucketItems(organizationSummary, t)}
					total={getDepartmentDistributionTotal(organizationSummary)}
					loading={loading}
					styles={styles}
				/>
			</div>
		)
	}

	if (view === VIEW.ConsumptionAnalysis) {
		const consumptionSummary = summary as DataDashboard.ConsumptionAnalysisSummary | null
		return (
			<div className={styles.analysisGrid}>
				<ChartPanel
					key={VIEW.ConsumptionAnalysis}
					title={t("charts.consumptionTrend")}
					data={buildConsumptionTrend(consumptionSummary, dateQuery)}
					metrics={getConsumptionTrendMetrics(t)}
					axisLabels={{
						left: t("charts.consumptionAxis"),
						right: t("charts.callsAxis"),
					}}
					fullWidth
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
			amount: 0,
			tokens: 0,
			activeAgents: item.active_agent_count,
			activeMembers: 0,
		})) ?? []
	)
}

function getAgentTrendMetrics(t: DashboardT): ChartMetricConfig[] {
	return [
		{
			dataKey: TREND_DATA_KEY.Calls,
			label: t("columns.calls"),
			chartType: CHART_METRIC_TYPE.Bar,
			yAxisId: CHART_AXIS.Left,
			color: CHART_COLORS.calls,
		},
		{
			dataKey: TREND_DATA_KEY.ActiveAgents,
			label: t("columns.activeAgents"),
			chartType: CHART_METRIC_TYPE.Line,
			yAxisId: CHART_AXIS.Right,
			color: CHART_COLORS.activeAgents,
		},
	]
}

function getMemberTrendMetrics(t: DashboardT): ChartMetricConfig[] {
	return [
		{
			dataKey: TREND_DATA_KEY.Calls,
			label: t("columns.calls"),
			chartType: CHART_METRIC_TYPE.Bar,
			yAxisId: CHART_AXIS.Left,
			color: CHART_COLORS.calls,
		},
		{
			dataKey: TREND_DATA_KEY.ActiveMembers,
			label: t("columns.activeMembers"),
			chartType: CHART_METRIC_TYPE.Line,
			yAxisId: CHART_AXIS.Right,
			color: CHART_COLORS.activeMembers,
		},
	]
}

function getConsumptionTrendMetrics(t: DashboardT): ChartMetricConfig[] {
	return [
		{
			dataKey: TREND_DATA_KEY.Tokens,
			label: t("columns.tokens"),
			chartType: CHART_METRIC_TYPE.Line,
			yAxisId: CHART_AXIS.Left,
			color: CHART_COLORS.tokens,
		},
		{
			dataKey: TREND_DATA_KEY.Amount,
			label: t("columns.amount"),
			chartType: CHART_METRIC_TYPE.Line,
			yAxisId: CHART_AXIS.Left,
			color: CHART_COLORS.amount,
		},
		{
			dataKey: TREND_DATA_KEY.Calls,
			label: t("columns.calls"),
			chartType: CHART_METRIC_TYPE.Bar,
			yAxisId: CHART_AXIS.Right,
			color: CHART_COLORS.calls,
		},
	]
}

function buildMemberTrend(summary: DataDashboard.MemberSummary | null): TrendPoint[] {
	return (
		summary?.usage_trend.map((item) => ({
			period: item.date,
			calls: item.call_count,
			amount: 0,
			tokens: 0,
			activeAgents: 0,
			activeMembers: item.active_member_count,
		})) ?? []
	)
}

function buildConsumptionTrend(
	summary: DataDashboard.ConsumptionAnalysisSummary | null,
	dateQuery: Pick<DataDashboard.BaseQuery, "start_date" | "end_date">,
): TrendPoint[] {
	return fillConsumptionTrend(summary?.usage_trend ?? [], dateQuery).map((item) => ({
		period: item.date,
		calls: item.call_count,
		amount: item.points,
		tokens: item.tokens,
		activeAgents: 0,
		activeMembers: 0,
	}))
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

function buildDepartmentBucketItems(
	summary: DataDashboard.OrganizationSummary | null,
	t: DashboardT,
): BucketItem[] {
	return [
		{
			name: t("buckets.highUseDepartment"),
			meta: t("buckets.highUseDepartmentDesc"),
			value: getDepartmentDistributionCount(summary, "high"),
			tone: BUCKET_TONE.High,
		},
		{
			name: t("buckets.mediumUseDepartment"),
			meta: t("buckets.mediumUseDepartmentDesc"),
			value: getDepartmentDistributionCount(summary, "medium"),
			tone: BUCKET_TONE.Stable,
		},
		{
			name: t("buckets.lowUseDepartment"),
			meta: t("buckets.lowUseDepartmentDesc"),
			value: getDepartmentDistributionCount(summary, "low"),
			tone: BUCKET_TONE.Low,
		},
		{
			name: t("buckets.unusedDepartment"),
			meta: t("buckets.unusedDepartmentDesc"),
			value: getDepartmentDistributionCount(summary, "unused"),
			tone: BUCKET_TONE.Unused,
		},
	]
}

function getDepartmentDistributionCount(
	summary: DataDashboard.OrganizationSummary | null,
	usageType: DataDashboard.DepartmentUsageType,
) {
	return (
		summary?.usage_distribution.find((item) => item.usage_type === usageType)
			?.department_count ?? 0
	)
}

function getDepartmentDistributionTotal(summary: DataDashboard.OrganizationSummary | null) {
	return (
		summary?.usage_distribution.reduce((total, item) => total + item.department_count, 0) ?? 0
	)
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

interface DepartmentPenetrationPanelProps {
	/** 组织分析汇总数据 */
	summary: DataDashboard.OrganizationSummary | null
	/** 组织分析数据是否正在加载 */
	loading: boolean
	/** 数据看板样式类名集合 */
	styles: Record<string, string>
	/** 数据看板国际化函数 */
	t: DashboardT
}

function DepartmentPenetrationPanel({
	summary,
	loading,
	styles,
	t,
}: DepartmentPenetrationPanelProps) {
	const [selectedLevel, setSelectedLevel] = useState<DataDashboard.DepartmentLevel>(1)
	const rows = useMemo(() => {
		const levelRows =
			summary?.department_statistics.filter(
				(item) => item.department_level === selectedLevel,
			) ?? []

		return [...levelRows].sort((left, right) => {
			const activationRateDiff =
				safeDivide(right.active_member_count, right.employed_member_count) -
				safeDivide(left.active_member_count, left.employed_member_count)
			if (activationRateDiff !== 0) return activationRateDiff

			const activeMemberDiff = right.active_member_count - left.active_member_count
			if (activeMemberDiff !== 0) return activeMemberDiff

			const callCountDiff = right.call_count - left.call_count
			if (callCountDiff !== 0) return callCountDiff

			return left.department_name.localeCompare(right.department_name)
		})
	}, [summary?.department_statistics, selectedLevel])

	return (
		<section className={styles.panel}>
			<div className={styles.cardHeader}>
				<h2 className={styles.cardTitle}>{t("charts.departmentPenetration")}</h2>
				<Segmented
					className={styles.levelSegmented}
					value={selectedLevel}
					options={[
						{ label: t("levels.level1"), value: 1 },
						{ label: t("levels.level2"), value: 2 },
						{ label: t("levels.level3"), value: 3 },
					]}
					onChange={(value) =>
						setSelectedLevel(Number(value) as DataDashboard.DepartmentLevel)
					}
				/>
			</div>
			<Spin spinning={loading}>
				<div
					className={styles.departmentPenetrationContent}
					style={{
						alignItems: rows.length < 3 && rows.length > 0 ? "flex-start" : "center",
					}}
				>
					{rows.length > 0 ? (
						<div className={styles.departmentPenetrationList}>
							{rows.map((row, index) => {
								const activationRate = safeDivide(
									row.active_member_count,
									row.employed_member_count,
								)
								const rankTone =
									DEPARTMENT_RANK_TONES[index] ??
									DEPARTMENT_RANK_TONES[DEPARTMENT_RANK_TONES.length - 1]
								const departmentTag =
									row.department_level === 1
										? t(DEPARTMENT_LEVEL_TAG_MAP[row.department_level])
										: displayText(row.parent_department_path)

								return (
									<div
										key={row.department_id}
										className={styles.departmentPenetrationItem}
									>
										<div
											className={styles.departmentRank}
											style={
												{
													"--department-rank-color": rankTone.color,
													"--department-rank-bg": rankTone.background,
												} as CSSProperties
											}
										>
											{String(index + 1).padStart(2, "0")}
										</div>
										<div className={styles.departmentNameLine}>
											<div className={styles.departmentName}>
												{row.department_name}
											</div>
											<div
												className={styles.departmentLevelTag}
												title={departmentTag}
											>
												{departmentTag}
											</div>
										</div>
										<div className={styles.departmentRate}>
											{formatPercent(activationRate)}
										</div>
										<div className={styles.departmentMeta}>
											{t("charts.departmentPenetrationMeta", {
												active: formatNumber(row.active_member_count),
												employed: formatNumber(row.employed_member_count),
												calls: formatNumber(row.call_count),
												points: formatNumber(row.points),
											})}
										</div>
										<Progress
											className={styles.departmentProgress}
											showInfo={false}
											percent={Math.min(
												activationRate * RATIO_BASE,
												MAX_PROGRESS_PERCENT,
											)}
											strokeColor={CHART_COLORS.calls}
											size="small"
										/>
									</div>
								)
							})}
						</div>
					) : loading ? null : (
						<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
					)}
				</div>
			</Spin>
		</section>
	)
}

interface ChartPanelProps {
	/** 图表标题 */
	title: string
	/** 图表辅助说明 */
	desc?: string
	/** 图表趋势数据 */
	data: TrendPoint[]
	/** 指标的数据字段、图形类型、坐标轴和颜色配置 */
	metrics: ChartMetricConfig[]
	/** 左右纵轴的标题配置 */
	axisLabels?: ChartAxisLabels
	/** 是否横跨分析区域的全部列 */
	fullWidth?: boolean
	/** 图表数据是否正在加载 */
	loading: boolean
	/** 数据看板样式类名集合 */
	styles: Record<string, string>
}

function ChartPanel({
	title,
	desc,
	data,
	metrics,
	axisLabels = EMPTY_CHART_AXIS_LABELS,
	fullWidth = false,
	loading,
	styles,
}: ChartPanelProps) {
	const [visibleMetricKeys, setVisibleMetricKeys] = useState<TrendMetricKey[]>(() =>
		metrics.map((metric) => metric.dataKey),
	)
	const visibleMetricKeySet = new Set(visibleMetricKeys)
	const visibleMetrics = metrics.filter((metric) => visibleMetricKeySet.has(metric.dataKey))
	const visibleAxisIds = new Set(visibleMetrics.map((metric) => metric.yAxisId))
	const onlyVisibleMetricKey = visibleMetricKeys.length === 1 ? visibleMetricKeys[0] : null
	const hasData = data.some((item) => metrics.some((metric) => item[metric.dataKey] > 0))

	return (
		<section className={`${styles.panel} ${fullWidth ? styles.fullPanel : ""}`}>
			<div className={styles.cardHeader}>
				<div>
					<h2 className={styles.cardTitle}>{title}</h2>
					{desc ? <div className={styles.cardDesc}>{desc}</div> : null}
				</div>
				<Checkbox.Group
					className={styles.chartMetricSelector}
					value={visibleMetricKeys}
					onChange={(values) => {
						if (values.length === 0) return
						setVisibleMetricKeys(values as TrendMetricKey[])
					}}
				>
					{metrics.map((metric) => (
						<Checkbox
							key={metric.dataKey}
							value={metric.dataKey}
							disabled={onlyVisibleMetricKey === metric.dataKey}
						>
							{metric.label}
						</Checkbox>
					))}
				</Checkbox.Group>
			</div>
			<Spin spinning={loading}>
				<div className={`${styles.chartBox} ${!hasData && !loading && styles.empty}`}>
					{hasData ? (
						<ResponsiveContainer>
							<ComposedChart data={data} margin={{ top: 24, left: 10 }}>
								<CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
								<XAxis
									dataKey={TREND_DATA_KEY.Period}
									tick={{ fontSize: 12, fill: "#8c8c8c" }}
									tickLine={false}
									axisLine={false}
								/>
								{CHART_AXIS_IDS.map((axisId) => {
									if (!visibleAxisIds.has(axisId)) return null
									const axisLabel = axisLabels[axisId]
									return (
										<YAxis
											key={axisId}
											yAxisId={axisId}
											orientation={
												axisId === CHART_AXIS.Right
													? CHART_AXIS.Right
													: CHART_AXIS.Left
											}
											tick={{ fontSize: 12, fill: "#8c8c8c" }}
											tickLine={false}
											axisLine={false}
											label={
												axisLabel
													? {
															value: axisLabel,
															position: "top",
															offset: 12,
															fill: "#8c8c8c",
															fontSize: 12,
														}
													: undefined
											}
										/>
									)
								})}
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
								{visibleMetrics.map((metric) =>
									metric.chartType === CHART_METRIC_TYPE.Line ? (
										<Line
											key={metric.dataKey}
											yAxisId={metric.yAxisId}
											type="monotone"
											dataKey={metric.dataKey}
											name={metric.label}
											stroke={metric.color}
											strokeWidth={2}
											dot={{ r: 3, strokeWidth: 2 }}
										/>
									) : (
										<Bar
											key={metric.dataKey}
											yAxisId={metric.yAxisId}
											dataKey={metric.dataKey}
											name={metric.label}
											fill={metric.color}
											maxBarSize={CHART_MAX_BAR_SIZE}
											radius={[4, 4, 0, 0]}
										/>
									),
								)}
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

interface BucketPanelProps {
	/** 分层面板标题 */
	title: string
	/** 各分层的名称、说明、数量和色彩配置 */
	items: BucketItem[]
	/** 计算各分层占比时使用的总数 */
	total: number
	/** 分层数据是否正在加载 */
	loading: boolean
	/** 数据看板样式类名集合 */
	styles: Record<string, string>
}

function BucketPanel({ title, items, total, loading, styles }: BucketPanelProps) {
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
