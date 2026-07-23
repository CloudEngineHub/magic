import { type CSSProperties } from "react"
import { Skeleton, Tooltip } from "antd"
import {
	BarChart3,
	Bot,
	BriefcaseBusiness,
	Building2,
	CircleGauge,
	CircleHelp,
	Database,
	TrendingUp,
	UserRoundCheck,
	UsersRound,
} from "lucide-react"
import type { DataDashboard } from "@admin/types/datadashboard"
import {
	METRIC_KEY,
	METRIC_TONE_MAP,
	VIEW,
	type DataDashboardView,
	type MetricKey,
} from "../consts"
import type { DashboardT, MetricCardData } from "../types"
import { formatDecimal, formatNumber, formatPercent, safeDivide } from "../utils"

export function buildMetrics(
	view: DataDashboardView,
	summary: DataDashboard.AgentSummary | DataDashboard.MemberSummary | null,
	t: DashboardT,
): MetricCardData[] {
	if (!summary) return []

	if (view === VIEW.DigitalEmployeeAnalysis) {
		const agentSummary = summary as DataDashboard.AgentSummary
		const agentActiveRate = safeDivide(
			agentSummary.active_agent_count,
			agentSummary.agent_total,
		)
		return [
			metricFromKey(t, METRIC_KEY.AgentTotal, formatNumber(agentSummary.agent_total), "gray"),
			metricFromKey(
				t,
				METRIC_KEY.ActiveAgents,
				formatNumber(agentSummary.active_agent_count),
				"green",
			),
			metricFromKey(t, METRIC_KEY.AgentActiveRate, formatPercent(agentActiveRate), "green"),
			metricFromKey(
				t,
				METRIC_KEY.AgentCalls,
				formatNumber(agentSummary.total_call_count),
				"blue",
			),
			metricFromKey(
				t,
				METRIC_KEY.AgentMembers,
				formatNumber(agentSummary.member_count),
				"cyan",
			),
			metricFromKey(
				t,
				METRIC_KEY.AgentDepartments,
				formatNumber(agentSummary.department_count),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.AgentAmount,
				formatNumber(agentSummary.total_points),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.AgentTokens,
				formatNumber(agentSummary.total_tokens),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.AvgAmount,
				formatNumber(safeDivide(agentSummary.total_points, agentSummary.total_call_count)),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.AvgTokens,
				formatNumber(safeDivide(agentSummary.total_tokens, agentSummary.total_call_count)),
				"gray",
			),
		]
	}

	if (view === VIEW.MemberAnalysis) {
		const memberSummary = summary as DataDashboard.MemberSummary
		const activeRate = safeDivide(
			memberSummary.active_member_count,
			memberSummary.employed_member_count,
		)
		const silentCount = Math.max(
			memberSummary.employed_member_count - memberSummary.active_member_count,
			0,
		)
		const callingMemberCount = memberSummary.calling_member_count

		return [
			metricFromKey(
				t,
				METRIC_KEY.ActiveMembers,
				`${formatNumber(memberSummary.active_member_count)} / ${formatNumber(
					memberSummary.employed_member_count,
				)}`,
				"blue",
			),
			metricFromKey(t, METRIC_KEY.ActivationRate, formatPercent(activeRate), "green"),
			metricFromKey(
				t,
				METRIC_KEY.NewMembers,
				formatNumber(memberSummary.new_member_count),
				"cyan",
			),
			metricFromKey(t, METRIC_KEY.SilentMembers, formatNumber(silentCount), "orange"),
			metricFromKey(
				t,
				METRIC_KEY.MemberCalls,
				formatNumber(memberSummary.total_call_count),
				"blue",
			),
			metricFromKey(
				t,
				METRIC_KEY.MemberAvgCalls,
				formatDecimal(safeDivide(memberSummary.total_call_count, callingMemberCount)),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.MemberAvgAmount,
				formatNumber(safeDivide(memberSummary.total_points, callingMemberCount)),
				"gray",
			),
			metricFromKey(
				t,
				METRIC_KEY.MemberAvgTokens,
				formatNumber(safeDivide(memberSummary.total_tokens, callingMemberCount)),
				"gray",
			),
		]
	}

	return []
}

export function MetricGrid({
	metrics,
	styles,
	loading = false,
	skeletonCount = 8,
}: {
	metrics: MetricCardData[]
	styles: Record<string, string>
	loading?: boolean
	skeletonCount?: number
}) {
	if (loading && metrics.length === 0) {
		return (
			<div className={styles.metricGrid}>
				{Array.from({ length: skeletonCount }).map((_, index) => (
					<div key={index} className={styles.metricCard}>
						<Skeleton
							active
							title={{ width: "58%" }}
							paragraph={{ rows: 1, width: "42%" }}
						/>
					</div>
				))}
			</div>
		)
	}

	return (
		<div className={styles.metricGrid}>
			{metrics.map((item) => {
				const Icon = getMetricIcon(item.key)
				const tone = METRIC_TONE_MAP[item.tone]
				return (
					<div
						key={item.key}
						className={styles.metricCard}
						style={
							{
								"--metric-color": tone.color,
								"--metric-bg": tone.bg,
							} as CSSProperties
						}
					>
						<Skeleton
							active
							loading={loading}
							title={{ width: "58%" }}
							paragraph={{ rows: 1, width: "42%" }}
						>
							<div className={styles.metricIcon}>
								<Icon size={16} strokeWidth={1.8} />
							</div>
							<div className={styles.metricLabel}>
								{item.label}{" "}
								<Tooltip title={item.helper}>
									<CircleHelp className={styles.metricHelpIcon} size={13} />
								</Tooltip>
							</div>
							<div className={styles.metricValue}>{item.value}</div>
						</Skeleton>
					</div>
				)
			})}
		</div>
	)
}

function metricFromKey(
	t: DashboardT,
	key: MetricKey,
	value: string,
	tone: MetricCardData["tone"] = "gray",
): MetricCardData {
	return {
		key,
		label: t(`metrics.${key}`),
		value,
		helper: t(`helpers.${key}`),
		tone,
	}
}

const METRIC_ICON_MAP: Partial<Record<MetricKey, typeof BarChart3>> = {
	[METRIC_KEY.ActiveMembers]: BarChart3,
	[METRIC_KEY.ActivationRate]: Database,
	[METRIC_KEY.NewMembers]: CircleGauge,
	[METRIC_KEY.SilentMembers]: UsersRound,
	[METRIC_KEY.MemberCalls]: UserRoundCheck,
	[METRIC_KEY.MemberAvgCalls]: Building2,
	[METRIC_KEY.MemberAvgAmount]: Bot,
	[METRIC_KEY.MemberAvgTokens]: TrendingUp,
	[METRIC_KEY.DepartmentLevels]: BarChart3,
	[METRIC_KEY.CoveredDepartments]: Database,
	[METRIC_KEY.UncoveredDepartments]: CircleGauge,
	[METRIC_KEY.DepartmentCoverage]: UsersRound,
	[METRIC_KEY.DepartmentAverageActivationRate]: UsersRound,
	[METRIC_KEY.DepartmentCalls]: Building2,
	[METRIC_KEY.DepartmentAmount]: BriefcaseBusiness,
	[METRIC_KEY.DepartmentTokens]: TrendingUp,
	[METRIC_KEY.DepartmentMemberAvgCalls]: BarChart3,
	[METRIC_KEY.DepartmentMemberAvgAmount]: Database,
	[METRIC_KEY.DepartmentMemberAvgTokens]: CircleGauge,
	[METRIC_KEY.AgentTotal]: BarChart3,
	[METRIC_KEY.ActiveAgents]: Database,
	[METRIC_KEY.AgentActiveRate]: CircleGauge,
	[METRIC_KEY.AgentCalls]: UsersRound,
	[METRIC_KEY.AgentMembers]: UserRoundCheck,
	[METRIC_KEY.AgentDepartments]: Building2,
	[METRIC_KEY.AgentAmount]: Bot,
	[METRIC_KEY.AgentTokens]: TrendingUp,
	[METRIC_KEY.AvgAmount]: BarChart3,
	[METRIC_KEY.AvgTokens]: Database,
	[METRIC_KEY.TotalAmount]: BriefcaseBusiness,
	[METRIC_KEY.TotalTokens]: Database,
}

function getMetricIcon(key: string) {
	const metricIcon = METRIC_ICON_MAP[key as MetricKey]
	if (metricIcon) return metricIcon
	if (key.toLowerCase().includes("token")) return Database
	if (key.toLowerCase().includes("agent")) return Bot
	if (key.toLowerCase().includes("department")) return Building2
	if (key.toLowerCase().includes("member")) return UsersRound
	if (key.toLowerCase().includes("rate") || key.toLowerCase().includes("daily"))
		return CircleGauge
	if (key.toLowerCase().includes("avg")) return BriefcaseBusiness
	if (key.toLowerCase().includes("amount") || key.toLowerCase().includes("call")) return BarChart3
	return TrendingUp
}
