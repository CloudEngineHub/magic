import { describe, expect, it } from "vitest"
import type { DataDashboard } from "@admin/types/datadashboard"
import { METRIC_KEY, VIEW } from "../../consts"
import type { DashboardT } from "../../types"
import { buildMetrics } from "../MetricGrid"

const t: DashboardT = (key) => key

function getMetricValue(metrics: ReturnType<typeof buildMetrics>, key: string) {
	return metrics.find((metric) => metric.key === key)?.value
}

describe("buildMetrics organization analysis", () => {
	it("uses actual level counts, distributions, and the calling-member denominator", () => {
		const summary: DataDashboard.OrganizationSummary = {
			level_1_department_count: 29,
			level_2_department_count: 38,
			level_3_department_count: 20,
			calling_member_count: 4,
			total_call_count: 20,
			total_points: 100,
			total_tokens: 200,
			department_statistics: [
				{
					department_id: "department-1",
					department_name: "Department 1",
					department_level: 1,
					employed_member_count: 2,
					active_member_count: 1,
					call_count: 10,
					points: 50,
				},
				{
					department_id: "department-2",
					department_name: "Department 2",
					department_level: 2,
					employed_member_count: 0,
					active_member_count: 0,
					call_count: 0,
					points: 0,
				},
				{
					department_id: "department-3",
					department_name: "Department 3",
					department_level: 3,
					employed_member_count: 4,
					active_member_count: 1,
					call_count: 10,
					points: 50,
				},
			],
			usage_distribution: [
				{ usage_type: "high", department_count: 1 },
				{ usage_type: "medium", department_count: 1 },
				{ usage_type: "low", department_count: 1 },
				{ usage_type: "unused", department_count: 4 },
			],
		}

		const metrics = buildMetrics(VIEW.OrganizationAnalysis, summary, t)

		expect(getMetricValue(metrics, METRIC_KEY.DepartmentLevels)).toBe("29 / 38 / 20")
		expect(getMetricValue(metrics, METRIC_KEY.CoveredDepartments)).toBe("3")
		expect(getMetricValue(metrics, METRIC_KEY.UncoveredDepartments)).toBe("4")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentCoverage)).toBe("42.9%")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentAverageActivationRate)).toBe("25.0%")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentCalls)).toBe("20")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentAmount)).toBe("100")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentTokens)).toBe("200")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentMemberAvgCalls)).toBe("5.0")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentMemberAvgAmount)).toBe("25")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentMemberAvgTokens)).toBe("50")
	})
})

describe("buildMetrics consumption analysis", () => {
	it("builds all consumption averages with the documented denominators", () => {
		const summary: DataDashboard.ConsumptionAnalysisSummary = {
			total_call_count: 6,
			calling_member_count: 3,
			department_count: 2,
			active_agent_count: 4,
			total_points: 1200,
			total_tokens: 2400,
			usage_trend: [],
		}

		const metrics = buildMetrics(VIEW.ConsumptionAnalysis, summary, t, 4)

		expect(metrics).toHaveLength(12)
		expect(getMetricValue(metrics, METRIC_KEY.TotalAmount)).toBe("1,200")
		expect(getMetricValue(metrics, METRIC_KEY.TotalTokens)).toBe("2,400")
		expect(getMetricValue(metrics, METRIC_KEY.DailyAmount)).toBe("300")
		expect(getMetricValue(metrics, METRIC_KEY.DailyTokens)).toBe("600")
		expect(getMetricValue(metrics, METRIC_KEY.AvgAmount)).toBe("200")
		expect(getMetricValue(metrics, METRIC_KEY.AvgTokens)).toBe("400")
		expect(getMetricValue(metrics, METRIC_KEY.MemberAvgAmount)).toBe("400")
		expect(getMetricValue(metrics, METRIC_KEY.MemberAvgTokens)).toBe("800")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentAvgAmount)).toBe("600")
		expect(getMetricValue(metrics, METRIC_KEY.DepartmentAvgTokens)).toBe("1,200")
		expect(getMetricValue(metrics, METRIC_KEY.AgentAvgAmount)).toBe("300")
		expect(getMetricValue(metrics, METRIC_KEY.AgentAvgTokens)).toBe("600")
	})
})
