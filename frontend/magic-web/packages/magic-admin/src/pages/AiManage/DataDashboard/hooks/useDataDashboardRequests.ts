import { useEffect, useMemo } from "react"
import { useRequest } from "ahooks"
import { useApis } from "@admin/apis"
import type { DataDashboard } from "@admin/types/datadashboard"
import { VIEW, type DataDashboardView } from "../consts"
import {
	type DashboardSummaryRequest,
	type DashboardTabsRequest,
	type DashboardTabType,
} from "../types"

interface UseDataDashboardRequestsOptions {
	view: DataDashboardView
	stateView: DataDashboardView
	currentTab: DashboardTabType
	agentQuery: DataDashboard.AgentSummaryQuery
	memberQuery: DataDashboard.MemberSummaryQuery
	organizationQuery: DataDashboard.OrganizationSummaryQuery
	consumptionQuery: DataDashboard.ConsumptionAnalysisQuery
	page: number
	pageSize: number
}

export function useDataDashboardRequests({
	view,
	stateView,
	currentTab,
	agentQuery,
	memberQuery,
	organizationQuery,
	consumptionQuery,
	page,
	pageSize,
}: UseDataDashboardRequestsOptions) {
	const { AIManageApi } = useApis()

	const summaryRequest = useMemo<DashboardSummaryRequest | null>(() => {
		if (stateView !== view) return null

		if (stateView === VIEW.DigitalEmployeeAnalysis) {
			return {
				view: stateView,
				query: agentQuery,
			}
		}

		if (stateView === VIEW.OrganizationAnalysis) {
			return {
				view: stateView,
				query: organizationQuery,
			}
		}

		if (stateView === VIEW.MemberAnalysis) {
			return {
				view: stateView,
				query: memberQuery,
			}
		}

		if (stateView === VIEW.ConsumptionAnalysis) {
			return {
				view: stateView,
				query: consumptionQuery,
			}
		}

		return null
	}, [agentQuery, consumptionQuery, memberQuery, organizationQuery, stateView, view])

	const tabsRequest = useMemo<DashboardTabsRequest | null>(() => {
		if (stateView !== view) return null

		if (stateView === VIEW.DigitalEmployeeAnalysis) {
			return {
				view: stateView,
				query: {
					...agentQuery,
					tab_type: currentTab as DataDashboard.AgentTabType,
					page,
					page_size: pageSize,
				},
			}
		}

		if (stateView === VIEW.OrganizationAnalysis) {
			return {
				view: stateView,
				query: {
					...organizationQuery,
					tab_type: currentTab as DataDashboard.OrganizationTabType,
					page,
					page_size: pageSize,
				},
			}
		}

		if (stateView === VIEW.MemberAnalysis) {
			return {
				view: stateView,
				query: {
					...memberQuery,
					tab_type: currentTab as DataDashboard.MemberTabType,
					page,
					page_size: pageSize,
				},
			}
		}

		return null
	}, [agentQuery, currentTab, memberQuery, organizationQuery, page, pageSize, stateView, view])

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
		data: organizationSummary = null,
		loading: organizationSummaryLoading,
		run: runOrganizationSummary,
	} = useRequest(
		(query: DataDashboard.OrganizationSummaryQuery) =>
			AIManageApi.getDataDashboardOrganizationSummary(query),
		{ manual: true },
	)
	const {
		data: consumptionSummary = null,
		loading: consumptionSummaryLoading,
		run: runConsumptionSummary,
	} = useRequest(
		(query: DataDashboard.ConsumptionAnalysisQuery) =>
			AIManageApi.getDataDashboardConsumptionSummary(query),
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
	const {
		data: organizationTabs,
		loading: organizationTabsLoading,
		run: runOrganizationTabs,
	} = useRequest(
		(query: DataDashboard.OrganizationTabsQuery) =>
			AIManageApi.getDataDashboardOrganizationTabs(query),
		{ manual: true },
	)

	useEffect(() => {
		runAgentOptions()
	}, [runAgentOptions, view])

	useEffect(() => {
		if (!summaryRequest) return

		// StrictMode 会重放首次 effect；每次都交给 useRequest 启动有效请求，避免保留已取消请求的 key。
		if (summaryRequest.view === VIEW.DigitalEmployeeAnalysis) {
			runAgentSummary(summaryRequest.query)
		} else if (summaryRequest.view === VIEW.OrganizationAnalysis) {
			runOrganizationSummary(summaryRequest.query)
		} else if (summaryRequest.view === VIEW.ConsumptionAnalysis) {
			runConsumptionSummary(summaryRequest.query)
		} else {
			runMemberSummary(summaryRequest.query)
		}
	}, [
		summaryRequest,
		runAgentSummary,
		runConsumptionSummary,
		runMemberSummary,
		runOrganizationSummary,
	])

	useEffect(() => {
		if (!tabsRequest) return

		if (tabsRequest.view === VIEW.DigitalEmployeeAnalysis) {
			runAgentTabs(tabsRequest.query)
		} else if (tabsRequest.view === VIEW.OrganizationAnalysis) {
			runOrganizationTabs(tabsRequest.query)
		} else {
			runMemberTabs(tabsRequest.query)
		}
	}, [runAgentTabs, runMemberTabs, runOrganizationTabs, tabsRequest])

	const summaryLoading =
		stateView === VIEW.DigitalEmployeeAnalysis
			? agentSummaryLoading
			: stateView === VIEW.OrganizationAnalysis
				? organizationSummaryLoading
				: stateView === VIEW.ConsumptionAnalysis
					? consumptionSummaryLoading
					: memberSummaryLoading
	const tableLoading =
		stateView === VIEW.ConsumptionAnalysis
			? false
			: stateView === VIEW.DigitalEmployeeAnalysis
				? agentTabsLoading
				: stateView === VIEW.OrganizationAnalysis
					? organizationTabsLoading
					: memberTabsLoading
	const tabData =
		stateView !== VIEW.ConsumptionAnalysis && !tableLoading
			? stateView === VIEW.DigitalEmployeeAnalysis
				? agentTabs
				: stateView === VIEW.OrganizationAnalysis
					? organizationTabs
					: memberTabs
			: undefined

	const summaryData =
		stateView === VIEW.DigitalEmployeeAnalysis
			? agentSummary
			: stateView === VIEW.OrganizationAnalysis
				? organizationSummary
				: stateView === VIEW.ConsumptionAnalysis
					? consumptionSummary
					: memberSummary

	return {
		agentOptions,
		agentOptionsLoading,
		summaryData,
		summaryLoading,
		tableLoading,
		tabData,
	}
}
