import { useEffect, useMemo, useState } from "react"
import { Input, Select } from "antd"
import { RotateCcw, Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useRequest } from "ahooks"
import {
	MagicButton,
	TimeFilterPanel,
	TimePresetKey,
	UserSelect,
	type TimeRangeValue,
} from "@admin-components"
import { useApis } from "@admin/apis"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import { useOrganizationTree } from "@admin/hooks/useOrganizationTree"
import type { DataDashboard } from "@admin/types/datadashboard"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { DetailSection } from "./components/DetailSection"
import { buildMetrics, MetricGrid } from "./components/MetricGrid"
import { Visualization } from "./components/Visualization"
import {
	AGENT_SOURCE_OPTIONS,
	ALL_OPTION_VALUE,
	DEFAULT_TAB_BY_VIEW,
	PAGE_TEXT_KEY_BY_VIEW,
	TABLE_PAGE_SIZE,
	VIEW,
} from "./consts"
import { useStyles } from "./styles"
import type { DataDashboardView } from "./consts"
import {
	createDefaultTimeRange,
	getDateQuery,
	getDepartmentId,
	isAgentTab,
	isMemberTab,
	type DashboardTabType,
} from "./remoteUtils"

interface DataDashboardPageProps {
	view: DataDashboardView
}

export default function DataDashboardPage({ view }: DataDashboardPageProps) {
	const isMobile = useIsMobile()
	const { t } = useTranslation("admin/ai/dataDashboard")
	const { AIManageApi } = useApis()
	const { styles } = useStyles({ isMobile })
	const { fetchMagicDepartmentUser, organizationInfo } = useOrganizationTree()
	const [timeRange, setTimeRange] = useState<TimeRangeValue | null>(() =>
		createDefaultTimeRange(t("filters.last7Days")),
	)

	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(TABLE_PAGE_SIZE)
	const [departments, setDepartments] = useState<TreeNode[]>([])
	const [agentCode, setAgentCode] = useState("")
	const [memberId, setMemberId] = useState("")
	const [agentSource, setAgentSource] = useState<
		DataDashboard.AgentSourceType | typeof ALL_OPTION_VALUE
	>(ALL_OPTION_VALUE)
	const [activeTab, setActiveTab] = useState<DashboardTabType>(
		view === VIEW.DigitalEmployeeAnalysis
			? DEFAULT_TAB_BY_VIEW[VIEW.DigitalEmployeeAnalysis]
			: DEFAULT_TAB_BY_VIEW[VIEW.MemberAnalysis],
	)

	const pageText = useMemo(() => {
		const pageTextKey = PAGE_TEXT_KEY_BY_VIEW[view]
		return {
			title: t(`pages.${pageTextKey}.title`),
			desc: t(`pages.${pageTextKey}.desc`),
		}
	}, [t, view])

	const baseQuery = useMemo<DataDashboard.BaseQuery>(() => {
		const departmentId = getDepartmentId(departments)
		const normalizedAgentCode = agentCode.trim()
		return {
			...getDateQuery(timeRange),
			agent_code: normalizedAgentCode || undefined,
			department_id: departmentId || undefined,
		}
	}, [agentCode, departments, timeRange])

	const agentQuery = useMemo<DataDashboard.AgentSummaryQuery>(
		() => ({
			...baseQuery,
			source_type: agentSource === ALL_OPTION_VALUE ? undefined : agentSource,
		}),
		[agentSource, baseQuery],
	)

	const memberQuery = useMemo<DataDashboard.MemberSummaryQuery>(() => {
		const normalizedMemberId = memberId.trim()
		return {
			...baseQuery,
			user_id: normalizedMemberId || undefined,
		}
	}, [baseQuery, memberId])

	const sourceOptions = useMemo(
		() => [
			{ label: t("filters.allSources"), value: ALL_OPTION_VALUE },
			...AGENT_SOURCE_OPTIONS.map((option) => ({
				label: t(option.labelKey),
				value: option.value,
			})),
		],
		[t],
	)
	const currentTab = useMemo<DashboardTabType>(() => {
		if (view === VIEW.DigitalEmployeeAnalysis) {
			return isAgentTab(activeTab)
				? activeTab
				: DEFAULT_TAB_BY_VIEW[VIEW.DigitalEmployeeAnalysis]
		}

		return isMemberTab(activeTab) ? activeTab : DEFAULT_TAB_BY_VIEW[VIEW.MemberAnalysis]
	}, [activeTab, view])

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

	useEffect(() => {
		setActiveTab(
			view === VIEW.DigitalEmployeeAnalysis
				? DEFAULT_TAB_BY_VIEW[VIEW.DigitalEmployeeAnalysis]
				: DEFAULT_TAB_BY_VIEW[VIEW.MemberAnalysis],
		)
		setPage(1)
	}, [view])

	useEffect(() => {
		if (view === VIEW.DigitalEmployeeAnalysis) {
			runAgentSummary(agentQuery)
			return
		}

		if (view === VIEW.MemberAnalysis) {
			runMemberSummary(memberQuery)
		}
	}, [agentQuery, memberQuery, runAgentSummary, runMemberSummary, view])

	useEffect(() => {
		if (view === VIEW.DigitalEmployeeAnalysis) {
			runAgentTabs({
				...agentQuery,
				tab_type: currentTab as DataDashboard.AgentTabType,
				page,
				page_size: pageSize,
			})
			return
		}

		if (view === VIEW.MemberAnalysis) {
			runMemberTabs({
				...memberQuery,
				tab_type: currentTab as DataDashboard.MemberTabType,
				page,
				page_size: pageSize,
			})
		}
	}, [agentQuery, currentTab, memberQuery, page, pageSize, runAgentTabs, runMemberTabs, view])

	const metrics = useMemo(
		() =>
			buildMetrics(
				view,
				view === VIEW.DigitalEmployeeAnalysis ? agentSummary : memberSummary,
				t,
			),
		[agentSummary, memberSummary, t, view],
	)

	const tabData = view === VIEW.DigitalEmployeeAnalysis ? agentTabs : memberTabs
	const summaryLoading =
		view === VIEW.DigitalEmployeeAnalysis ? agentSummaryLoading : memberSummaryLoading
	const tableLoading =
		view === VIEW.DigitalEmployeeAnalysis ? agentTabsLoading : memberTabsLoading

	const resetPage = () => {
		setPage(1)
	}

	const handleReset = () => {
		setTimeRange(createDefaultTimeRange(t("filters.last7Days")))
		setDepartments([])
		setAgentCode("")
		setMemberId("")
		setAgentSource(ALL_OPTION_VALUE)
		resetPage()
	}

	const handleTimeRangeChange = (value: TimeRangeValue | null) => {
		setTimeRange(value)
		resetPage()
	}

	const handleDepartmentChange = (selected: TreeNode[]) => {
		setDepartments(selected.filter((item) => item.dataType === NodeType.Department).slice(-1))
		resetPage()
	}

	const handleTabChange = (tab: DashboardTabType) => {
		setActiveTab(tab)
		resetPage()
	}

	const handlePageChange = (nextPage: number, nextPageSize: number) => {
		setPage(nextPage)
		setPageSize(nextPageSize)
	}

	return (
		<div className={styles.page}>
			<div className={styles.inner}>
				<header className={styles.header}>
					<div className={styles.titleBlock}>
						<h1 className={styles.title}>{pageText.title}</h1>
						<div className={styles.subtitle}>{pageText.desc}</div>
					</div>
					<MagicButton icon={<RotateCcw size={16} />} onClick={handleReset}>
						{t("actions.resetFilters")}
					</MagicButton>
				</header>

				<section className={styles.filterPanel}>
					<div className={styles.filterGrid}>
						<div className={styles.filterItem}>
							<div className={styles.filterLabel}>{t("filters.time")}</div>
							<div className={styles.timeFilter}>
								<TimeFilterPanel
									clearable={false}
									defaultPresetKey={TimePresetKey.last_7_days}
									value={timeRange}
									onChange={handleTimeRangeChange}
								/>
							</div>
						</div>
						<div className={styles.filterItem}>
							<div className={styles.filterLabel}>{t("filters.department")}</div>
							<UserSelect
								selected={departments}
								setSelected={handleDepartmentChange}
								placeholder={t("filters.departmentPlaceholder")}
								maxTagCount="responsive"
								departmentSelectorProps={{
									showUser: false,
									onFetchData: fetchMagicDepartmentUser,
									organization: organizationInfo,
								}}
								formItemProps={{ style: { marginBottom: 0 } }}
							/>
						</div>
						<div className={styles.filterItem}>
							<div className={styles.filterLabel}>{t("filters.digitalEmployee")}</div>
							<Input
								allowClear
								prefix={<Search size={16} />}
								value={agentCode}
								placeholder={t("filters.agentCodePlaceholder")}
								onChange={(event) => {
									setAgentCode(event.target.value)
									resetPage()
								}}
							/>
						</div>
						{view === VIEW.MemberAnalysis ? (
							<div className={styles.filterItem}>
								<div className={styles.filterLabel}>{t("filters.memberId")}</div>
								<Input
									allowClear
									prefix={<Search size={16} />}
									value={memberId}
									placeholder={t("filters.memberIdPlaceholder")}
									onChange={(event) => {
										setMemberId(event.target.value)
										resetPage()
									}}
								/>
							</div>
						) : null}
						{view === VIEW.DigitalEmployeeAnalysis ? (
							<div className={styles.filterItem}>
								<div className={styles.filterLabel}>{t("filters.source")}</div>
								<Select
									value={agentSource}
									options={sourceOptions}
									onChange={(value) => {
										setAgentSource(value)
										resetPage()
									}}
								/>
							</div>
						) : null}
					</div>
				</section>

				<MetricGrid metrics={metrics} styles={styles} />
				<Visualization
					view={view}
					agentSummary={agentSummary}
					memberSummary={memberSummary}
					styles={styles}
					t={t}
				/>
				<DetailSection
					view={view}
					activeTab={currentTab}
					tabData={tabData}
					timeRange={timeRange}
					pageSize={pageSize}
					loading={tableLoading || summaryLoading}
					onTabChange={handleTabChange}
					onPageChange={handlePageChange}
				/>
			</div>
		</div>
	)
}
