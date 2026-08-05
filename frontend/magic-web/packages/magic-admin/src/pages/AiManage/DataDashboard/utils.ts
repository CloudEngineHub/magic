import dayjs from "dayjs"
import type { TimeRangeValue } from "@admin-components"
import type { DataDashboard } from "@admin/types/datadashboard"
import type { TreeNode } from "@dtyq/user-selector"
import { AGENT_TAB_TYPE, MEMBER_TAB_TYPE, ORGANIZATION_TAB_TYPE } from "./consts"
import type { DashboardTabType } from "./types"

const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss"
const DATE_FORMAT = "YYYY-MM-DD"

export const EMPTY_TEXT = "-"

const AGENT_TAB_TYPES = new Set<DashboardTabType>(Object.values(AGENT_TAB_TYPE))
const MEMBER_TAB_TYPES = new Set<DashboardTabType>(Object.values(MEMBER_TAB_TYPE))
const ORGANIZATION_TAB_TYPES = new Set<DashboardTabType>(Object.values(ORGANIZATION_TAB_TYPE))

export const formatNumber = (value: number) =>
	new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(Math.round(value || 0))

export const formatDecimal = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : "0.0")

export const formatPercent = (value: number) =>
	`${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`

export const safeDivide = (numerator: number, denominator: number) =>
	denominator > 0 ? numerator / denominator : 0

export const createDefaultTimeRange = (label: string): TimeRangeValue => ({
	startDate: dayjs().subtract(6, "day").startOf("day").format(DATE_TIME_FORMAT),
	endDate: dayjs().endOf("day").format(DATE_TIME_FORMAT),
	label,
	tab: "relative" as TimeRangeValue["tab"],
	mode: "relative" as TimeRangeValue["mode"],
	presetKey: "last_7_days" as TimeRangeValue["presetKey"],
})

export const getDateQuery = (timeRange: TimeRangeValue | null) => {
	if (!timeRange?.startDate || !timeRange?.endDate) return {}

	return {
		start_date: dayjs(timeRange.startDate).format(DATE_FORMAT),
		end_date: dayjs(timeRange.endDate).format(DATE_FORMAT),
	}
}

export const getStatisticsDayCount = ({
	start_date,
	end_date,
}: Pick<DataDashboard.BaseQuery, "start_date" | "end_date">) => {
	if (!start_date || !end_date) return 0

	const startDate = dayjs(start_date).startOf("day")
	const endDate = dayjs(end_date).startOf("day")
	if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) return 0

	return endDate.diff(startDate, "day") + 1
}

export const fillConsumptionTrend = (
	trend: DataDashboard.ConsumptionTrendItem[],
	dateQuery: Pick<DataDashboard.BaseQuery, "start_date" | "end_date">,
) => {
	const dayCount = getStatisticsDayCount(dateQuery)
	if (dayCount === 0 || !dateQuery.start_date) {
		return [...trend].sort((left, right) => left.date.localeCompare(right.date))
	}

	const trendByDate = new Map(trend.map((item) => [item.date, item]))
	const startDate = dayjs(dateQuery.start_date)

	// 后端只返回有统计结果的日期；补零可确保趋势图横轴覆盖完整自然日范围。
	return Array.from({ length: dayCount }, (_, index) => {
		const date = startDate.add(index, "day").format(DATE_FORMAT)
		return (
			trendByDate.get(date) ?? {
				date,
				call_count: 0,
				points: 0,
				tokens: 0,
			}
		)
	})
}

export const getDepartmentId = (departments: TreeNode[]) => {
	const department = departments[0] as (TreeNode & { department_id?: string }) | undefined
	return department?.department_id || department?.id
}

export const getMemberId = (members: TreeNode[]) => {
	const member = members[0] as (TreeNode & { user_id?: string }) | undefined
	return member?.user_id || member?.id
}

export const displayText = (value?: string | number | null) => {
	if (value === null || value === undefined || value === "") return EMPTY_TEXT
	return String(value)
}

export const exportCsv = (title: string, rows: Array<Record<string, unknown>>) => {
	if (!rows.length) return

	const headers = Object.keys(rows[0])
	const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
		.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
		.join("\n")
	const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = `${title}-${dayjs().format("YYYYMMDDHHmmss")}.csv`
	link.click()
	URL.revokeObjectURL(url)
}

export function isAgentTab(tab: DashboardTabType): tab is DataDashboard.AgentTabType {
	return AGENT_TAB_TYPES.has(tab)
}

export function isMemberTab(tab: DashboardTabType): tab is DataDashboard.MemberTabType {
	return MEMBER_TAB_TYPES.has(tab)
}

export function isOrganizationTab(tab: DashboardTabType): tab is DataDashboard.OrganizationTabType {
	return ORGANIZATION_TAB_TYPES.has(tab)
}
