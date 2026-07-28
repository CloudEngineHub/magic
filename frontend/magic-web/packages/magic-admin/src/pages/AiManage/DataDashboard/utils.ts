import dayjs from "dayjs"
import type { TimeRangeValue } from "@admin-components"
import type { DataDashboard } from "@admin/types/datadashboard"
import type { TreeNode } from "@dtyq/user-selector"
import { AGENT_TAB_TYPE, MEMBER_TAB_TYPE } from "./consts"

const DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss"
const DATE_FORMAT = "YYYY-MM-DD"

export const EMPTY_TEXT = "-"

export type DashboardTabType = DataDashboard.AgentTabType | DataDashboard.MemberTabType

const AGENT_TAB_TYPES = new Set<DashboardTabType>(Object.values(AGENT_TAB_TYPE))
const MEMBER_TAB_TYPES = new Set<DashboardTabType>(Object.values(MEMBER_TAB_TYPE))

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
