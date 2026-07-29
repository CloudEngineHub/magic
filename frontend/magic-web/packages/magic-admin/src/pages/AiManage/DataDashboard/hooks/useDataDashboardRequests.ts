import { useEffect, useMemo, useRef } from "react"
import { useMount, useRequest } from "ahooks"
import { useApis } from "@admin/apis"
import type { DataDashboard } from "@admin/types/datadashboard"
import { VIEW, type DataDashboardView } from "../consts"
import { type DashboardTabType } from "../utils"

type DashboardRequest =
	| {
			view: typeof VIEW.DigitalEmployeeAnalysis
			summaryKey: string
			tabsKey: string
			summaryQuery: DataDashboard.AgentSummaryQuery
			tabsQuery: DataDashboard.AgentTabsQuery
	  }
	| {
			view: typeof VIEW.MemberAnalysis
			summaryKey: string
			tabsKey: string
			summaryQuery: DataDashboard.MemberSummaryQuery
			tabsQuery: DataDashboard.MemberTabsQuery
	  }

interface UseDataDashboardRequestsOptions {
	view: DataDashboardView
	stateView: DataDashboardView
	currentTab: DashboardTabType
	agentQuery: DataDashboard.AgentSummaryQuery
	memberQuery: DataDashboard.MemberSummaryQuery
	page: number
	pageSize: number
}

const shouldSerializeQueryValue = (value: unknown) =>
	value !== undefined && value !== null && value !== ""

const normalizeQueryValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(normalizeQueryValue)
	}

	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, childValue]) => shouldSerializeQueryValue(childValue))
				.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
				.map(([childKey, childValue]) => [childKey, normalizeQueryValue(childValue)]),
		)
	}

	return value
}

const serializeRequestQuery = (query: Record<string, unknown>) =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(query)
				.filter(([, value]) => shouldSerializeQueryValue(value))
				.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
				.map(([key, value]) => [key, normalizeQueryValue(value)]),
		),
	)

const buildSummaryKey = (
	view: DataDashboardView,
	query: DataDashboard.AgentSummaryQuery | DataDashboard.MemberSummaryQuery,
	tabType: DashboardTabType,
) => serializeRequestQuery({ view, scope: "summary", tab_type: tabType, ...query })

const buildTabsKey = (
	view: DataDashboardView,
	query: DataDashboard.AgentTabsQuery | DataDashboard.MemberTabsQuery,
) => serializeRequestQuery({ view, scope: "tabs", ...query })

export function useDataDashboardRequests({
	view,
	stateView,
	currentTab,
	agentQuery,
	memberQuery,
	page,
	pageSize,
}: UseDataDashboardRequestsOptions) {
	const { AIManageApi } = useApis()
	const previousSummaryKeyRef = useRef("")
	const previousTabsKeyRef = useRef("")

	const dashboardRequest = useMemo<DashboardRequest | null>(() => {
		if (stateView !== view) return null

		if (stateView === VIEW.DigitalEmployeeAnalysis) {
			const tabsQuery: DataDashboard.AgentTabsQuery = {
				...agentQuery,
				tab_type: currentTab as DataDashboard.AgentTabType,
				page,
				page_size: pageSize,
			}
			const summaryKey = buildSummaryKey(stateView, agentQuery, currentTab)
			return {
				view: stateView,
				summaryKey,
				tabsKey: buildTabsKey(stateView, tabsQuery),
				summaryQuery: agentQuery,
				tabsQuery,
			}
		}

		if (stateView === VIEW.MemberAnalysis) {
			const tabsQuery: DataDashboard.MemberTabsQuery = {
				...memberQuery,
				tab_type: currentTab as DataDashboard.MemberTabType,
				page,
				page_size: pageSize,
			}
			const summaryKey = buildSummaryKey(stateView, memberQuery, currentTab)

			return {
				view: stateView,
				summaryKey,
				tabsKey: buildTabsKey(stateView, tabsQuery),
				summaryQuery: memberQuery,
				tabsQuery,
			}
		}

		return null
	}, [agentQuery, currentTab, memberQuery, page, pageSize, stateView, view])

	const {
		data: agentOptions,
		loading: agentOptionsLoading,
		run: runAgentOptions,
	} = useRequest(() => AIManageApi.getDataDashboardAgentOptions(), { manual: true })
	const {
		data: agentSummary = null,
		loading: agentSummaryLoading,
		run: runAgentSummary,
	} = useRequest(
		(query: DataDashboard.AgentSummaryQuery) => AIManageApi.getDataDashboardAgentSummary(query),
		{ manual: true },
	)
	const {
		data: memberSummary = null,
		loading: memberSummaryLoading,
		run: runMemberSummary,
	} = useRequest(
		(query: DataDashboard.MemberSummaryQuery) =>
			AIManageApi.getDataDashboardMemberSummary(query),
		{ manual: true },
	)
	const {
		data: agentTabs,
		loading: agentTabsLoading,
		run: runAgentTabs,
	} = useRequest(
		(query: DataDashboard.AgentTabsQuery) => AIManageApi.getDataDashboardAgentTabs(query),
		{ manual: true },
	)
	const {
		data: memberTabs,
		loading: memberTabsLoading,
		run: runMemberTabs,
	} = useRequest(
		(query: DataDashboard.MemberTabsQuery) => AIManageApi.getDataDashboardMemberTabs(query),
		{ manual: true },
	)

	useMount(() => {
		runAgentOptions()
	})

	useEffect(() => {
		if (!dashboardRequest) return

		if (previousSummaryKeyRef.current !== dashboardRequest.summaryKey) {
			previousSummaryKeyRef.current = dashboardRequest.summaryKey
			if (dashboardRequest.view === VIEW.DigitalEmployeeAnalysis) {
				runAgentSummary(dashboardRequest.summaryQuery)
			} else {
				runMemberSummary(dashboardRequest.summaryQuery)
			}
		}

		if (previousTabsKeyRef.current !== dashboardRequest.tabsKey) {
			previousTabsKeyRef.current = dashboardRequest.tabsKey
			if (dashboardRequest.view === VIEW.DigitalEmployeeAnalysis) {
				runAgentTabs(dashboardRequest.tabsQuery)
			} else {
				runMemberTabs(dashboardRequest.tabsQuery)
			}
		}
	}, [dashboardRequest, runAgentSummary, runAgentTabs, runMemberSummary, runMemberTabs])

	const summaryLoading =
		stateView === VIEW.DigitalEmployeeAnalysis ? agentSummaryLoading : memberSummaryLoading
	const tableLoading =
		stateView === VIEW.DigitalEmployeeAnalysis ? agentTabsLoading : memberTabsLoading
	const tabData = !tableLoading
		? stateView === VIEW.DigitalEmployeeAnalysis
			? agentTabs
			: memberTabs
		: undefined

	return {
		agentOptions,
		agentOptionsLoading,
		agentSummary,
		memberSummary,
		summaryLoading,
		tableLoading,
		tabData,
	}
}
