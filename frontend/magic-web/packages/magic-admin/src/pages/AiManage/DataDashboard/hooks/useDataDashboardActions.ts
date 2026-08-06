import { useEffect, useMemo, useReducer } from "react"
import type { TimeRangeValue } from "@admin-components"
import type { DataDashboard } from "@admin/types/datadashboard"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import {
	ALL_OPTION_VALUE,
	DEFAULT_TAB_BY_VIEW,
	TABLE_PAGE_SIZE,
	VIEW,
	type DataDashboardView,
} from "../consts"
import {
	createDefaultTimeRange,
	getDateQuery,
	getDepartmentId,
	getMemberId,
	isAgentTab,
	isMemberTab,
	isOrganizationTab,
} from "../utils"
import type { DashboardTabType } from "../types"

interface DashboardState {
	view: DataDashboardView
	timeRange: TimeRangeValue | null
	page: number
	pageSize: number
	departments: TreeNode[]
	members: TreeNode[]
	agentCode: string
	agentSource: DataDashboard.AgentSourceType | typeof ALL_OPTION_VALUE
	activeTab: DashboardTabType
}

type DashboardAction =
	| { type: "syncView"; view: DataDashboardView; timeRangeLabel: string }
	| { type: "reset"; timeRangeLabel: string }
	| { type: "setTimeRange"; value: TimeRangeValue | null }
	| { type: "setDepartments"; value: TreeNode[] }
	| { type: "setMembers"; value: TreeNode[] }
	| { type: "setAgentCode"; value: string }
	| { type: "setAgentSource"; value: DataDashboard.AgentSourceType | typeof ALL_OPTION_VALUE }
	| { type: "setActiveTab"; value: DashboardTabType }
	| { type: "setPage"; page: number; pageSize: number }

const getDefaultTab = (view: DataDashboardView): DashboardTabType =>
	view === VIEW.DigitalEmployeeAnalysis
		? DEFAULT_TAB_BY_VIEW[VIEW.DigitalEmployeeAnalysis]
		: view === VIEW.OrganizationAnalysis
			? DEFAULT_TAB_BY_VIEW[VIEW.OrganizationAnalysis]
			: DEFAULT_TAB_BY_VIEW[VIEW.MemberAnalysis]

const createDashboardState = (view: DataDashboardView, timeRangeLabel: string): DashboardState => ({
	view,
	timeRange: createDefaultTimeRange(timeRangeLabel),
	page: 1,
	pageSize: TABLE_PAGE_SIZE,
	departments: [],
	members: [],
	agentCode: "",
	agentSource: ALL_OPTION_VALUE,
	activeTab: getDefaultTab(view),
})

const dashboardReducer = (state: DashboardState, action: DashboardAction): DashboardState => {
	switch (action.type) {
		case "syncView":
			return state.view === action.view
				? state
				: createDashboardState(action.view, action.timeRangeLabel)
		case "reset":
			return createDashboardState(state.view, action.timeRangeLabel)
		case "setTimeRange":
			return { ...state, timeRange: action.value, page: 1 }
		case "setDepartments":
			return { ...state, departments: action.value, page: 1 }
		case "setMembers":
			return { ...state, members: action.value, page: 1 }
		case "setAgentCode":
			return { ...state, agentCode: action.value, page: 1 }
		case "setAgentSource":
			return { ...state, agentSource: action.value, page: 1 }
		case "setActiveTab":
			return { ...state, activeTab: action.value, page: 1 }
		case "setPage":
			return { ...state, page: action.page, pageSize: action.pageSize }
		default:
			return state
	}
}

export function useDataDashboardActions({
	view,
	timeRangeLabel,
}: {
	view: DataDashboardView
	timeRangeLabel: string
}) {
	const [dashboardState, dispatch] = useReducer(dashboardReducer, view, (initialView) =>
		createDashboardState(initialView, timeRangeLabel),
	)
	const {
		view: stateView,
		timeRange,
		page,
		pageSize,
		departments,
		members,
		agentCode,
		agentSource,
		activeTab,
	} = dashboardState

	useEffect(() => {
		dispatch({ type: "syncView", view, timeRangeLabel })
	}, [timeRangeLabel, view])

	const baseQuery = useMemo<DataDashboard.BaseQuery>(() => {
		const departmentId = getDepartmentId(departments)
		const normalizedAgentCode = agentCode.trim()
		const memberId = getMemberId(members)
		return {
			...getDateQuery(timeRange),
			agent_code: normalizedAgentCode || undefined,
			user_id: memberId || undefined,
			department_id: departmentId || undefined,
		}
	}, [agentCode, departments, members, timeRange])

	const agentQuery = useMemo<DataDashboard.AgentSummaryQuery>(
		() => ({
			...baseQuery,
			source_type: agentSource === ALL_OPTION_VALUE ? undefined : agentSource,
		}),
		[agentSource, baseQuery],
	)
	const memberQuery: DataDashboard.MemberSummaryQuery = baseQuery
	const organizationQuery = useMemo<DataDashboard.OrganizationSummaryQuery>(() => {
		const { agent_code, department_id, end_date, start_date } = baseQuery
		return {
			agent_code,
			department_id,
			end_date,
			start_date,
		}
	}, [baseQuery])
	const consumptionQuery: DataDashboard.ConsumptionAnalysisQuery = organizationQuery

	const currentTab = useMemo<DashboardTabType>(() => {
		if (stateView === VIEW.DigitalEmployeeAnalysis) {
			return isAgentTab(activeTab)
				? activeTab
				: DEFAULT_TAB_BY_VIEW[VIEW.DigitalEmployeeAnalysis]
		}

		if (stateView === VIEW.OrganizationAnalysis) {
			return isOrganizationTab(activeTab)
				? activeTab
				: DEFAULT_TAB_BY_VIEW[VIEW.OrganizationAnalysis]
		}

		return isMemberTab(activeTab) ? activeTab : DEFAULT_TAB_BY_VIEW[VIEW.MemberAnalysis]
	}, [activeTab, stateView])

	const metricSkeletonCount = useMemo(() => {
		switch (stateView) {
			case VIEW.ConsumptionAnalysis:
				return 12
			case VIEW.DigitalEmployeeAnalysis:
				return 10
			case VIEW.OrganizationAnalysis:
				return 11
			default:
				return 8
		}
	}, [stateView])

	const handleReset = () => {
		dispatch({ type: "reset", timeRangeLabel })
	}

	const handleTimeRangeChange = (value: TimeRangeValue | null) => {
		dispatch({ type: "setTimeRange", value })
	}

	const handleDepartmentChange = (selected: TreeNode[]) => {
		const newValue = selected.filter((item) => item.dataType === NodeType.Department).slice(-1)
		dispatch({ type: "setDepartments", value: newValue })
	}

	const handleMemberChange = (selected: TreeNode[]) => {
		const newValue = selected.filter((item) => item.dataType === NodeType.User).slice(-1)
		dispatch({ type: "setMembers", value: newValue })
	}

	const handleAgentCodeChange = (value: string) => {
		dispatch({ type: "setAgentCode", value })
	}

	const handleAgentSourceChange = (
		value: DataDashboard.AgentSourceType | typeof ALL_OPTION_VALUE,
	) => {
		dispatch({ type: "setAgentSource", value })
	}

	const handleTabChange = (tab: DashboardTabType) => {
		dispatch({ type: "setActiveTab", value: tab })
	}

	const handlePageChange = (nextPage: number, nextPageSize: number) => {
		dispatch({ type: "setPage", page: nextPage, pageSize: nextPageSize })
	}

	return {
		stateView,
		timeRange,
		page,
		pageSize,
		departments,
		members,
		agentCode,
		agentSource,
		currentTab,
		agentQuery,
		memberQuery,
		organizationQuery,
		consumptionQuery,
		metricSkeletonCount,
		handleReset,
		handleTimeRangeChange,
		handleDepartmentChange,
		handleMemberChange,
		handleAgentCodeChange,
		handleAgentSourceChange,
		handleTabChange,
		handlePageChange,
	}
}
