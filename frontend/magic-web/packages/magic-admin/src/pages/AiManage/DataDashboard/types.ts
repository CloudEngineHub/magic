import { VIEW } from "./consts"
import type { DataDashboard } from "@admin/types/datadashboard"

export type DashboardT = (key: string, options?: Record<string, unknown>) => string

export type DashboardTabType =
	| DataDashboard.AgentTabType
	| DataDashboard.MemberTabType
	| DataDashboard.OrganizationTabType

export type DashboardRow =
	| DataDashboard.AgentTabRow
	| DataDashboard.MemberTabRow
	| DataDashboard.OrganizationTabRow
export interface MetricCardData {
	key: string
	label: string
	value: string
	helper: string
	tone: "blue" | "green" | "orange" | "cyan" | "red" | "gray"
}

export type DashboardSummaryRequest =
	| {
			view: typeof VIEW.DigitalEmployeeAnalysis
			query: DataDashboard.AgentSummaryQuery
	  }
	| {
			view: typeof VIEW.MemberAnalysis
			query: DataDashboard.MemberSummaryQuery
	  }
	| {
			view: typeof VIEW.OrganizationAnalysis
			query: DataDashboard.OrganizationSummaryQuery
	  }
	| {
			view: typeof VIEW.ConsumptionAnalysis
			query: DataDashboard.ConsumptionAnalysisQuery
	  }

export type DashboardTabsRequest =
	| {
			view: typeof VIEW.DigitalEmployeeAnalysis
			query: DataDashboard.AgentTabsQuery
	  }
	| {
			view: typeof VIEW.MemberAnalysis
			query: DataDashboard.MemberTabsQuery
	  }
	| {
			view: typeof VIEW.OrganizationAnalysis
			query: DataDashboard.OrganizationTabsQuery
	  }
