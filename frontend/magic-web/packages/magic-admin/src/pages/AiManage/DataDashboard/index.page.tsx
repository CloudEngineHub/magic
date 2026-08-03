import { useMemo } from "react"
import { Select } from "antd"
import { RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	MagicButton,
	SearchSelect,
	TimeFilterPanel,
	TimeFilterPrecision,
	TimePresetKey,
	UserSelect,
} from "@admin-components"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import { useOrganizationTree } from "@admin/hooks/useOrganizationTree"
import { DetailSection } from "./components/DetailSection"
import { buildMetrics, MetricGrid } from "./components/MetricGrid"
import { Visualization } from "./components/Visualization"
import { AGENT_SOURCE_OPTIONS, ALL_OPTION_VALUE, PAGE_TEXT_KEY_BY_VIEW, VIEW } from "./consts"
import type { DataDashboardView } from "./consts"
import { useDataDashboardActions } from "./hooks/useDataDashboardActions"
import { useDataDashboardExport } from "./hooks/useDataDashboardExport"
import { useDataDashboardRequests } from "./hooks/useDataDashboardRequests"
import { useStyles } from "./styles"
import { displayText, formatNumber, getStatisticsDayCount } from "./utils"

interface DataDashboardPageProps {
	view: DataDashboardView
}

export default function DataDashboardPage({ view }: DataDashboardPageProps) {
	const isMobile = useIsMobile()
	const { t } = useTranslation("admin/ai/dataDashboard")
	const { styles } = useStyles({ isMobile })
	const { fetchMagicDepartmentUser, organizationInfo, searchUser } = useOrganizationTree()

	const {
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
	} = useDataDashboardActions({
		view,
		timeRangeLabel: t("filters.last7Days"),
	})

	const {
		agentOptions,
		agentOptionsLoading,
		summaryData,
		summaryLoading,
		tableLoading,
		tabData,
	} = useDataDashboardRequests({
		view,
		stateView,
		currentTab,
		agentQuery,
		memberQuery,
		organizationQuery,
		consumptionQuery,
		page,
		pageSize,
	})
	const { exportingTab, exportCurrentTab } = useDataDashboardExport({
		view: stateView,
		currentTab,
		agentQuery,
		memberQuery,
		organizationQuery,
	})

	const pageText = useMemo(() => {
		const pageTextKey = PAGE_TEXT_KEY_BY_VIEW[stateView]
		return {
			title: t(`pages.${pageTextKey}.title`),
			desc: t(`pages.${pageTextKey}.desc`),
		}
	}, [t, stateView])

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

	const agentSelectOptions = useMemo(
		() => [
			{
				label: t("filters.allDigitalEmployees"),
				value: ALL_OPTION_VALUE,
				searchText: t("filters.allDigitalEmployees"),
			},
			...(agentOptions?.list ?? []).map((agent) => {
				const label = agent.agent_name || agent.agent_code
				return {
					label,
					value: agent.agent_code,
					agentCode: agent.agent_code,
					agentName: agent.agent_name,
					searchText: `${agent.agent_name ?? ""} ${agent.agent_code}`,
				}
			}),
		],
		[agentOptions?.list, t],
	)

	const statisticsDayCount = getStatisticsDayCount(consumptionQuery)
	const metrics = useMemo(
		() => buildMetrics(stateView, summaryData, t, statisticsDayCount),
		[statisticsDayCount, summaryData, t, stateView],
	)

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
									precision={TimeFilterPrecision.day}
									value={timeRange}
									onChange={handleTimeRangeChange}
								/>
							</div>
						</div>
						{stateView !== VIEW.OrganizationAnalysis &&
						stateView !== VIEW.ConsumptionAnalysis ? (
							<div className={styles.filterItem}>
								<div className={styles.filterLabel}>{t("filters.memberId")}</div>
								<UserSelect
									selected={members}
									setSelected={handleMemberChange}
									placeholder={t("filters.memberIdPlaceholder")}
									maxTagCount="responsive"
									departmentSelectorProps={{
										onFetchData: fetchMagicDepartmentUser,
										searchUser,
										maxCount: 1,
										organization: organizationInfo,
									}}
									formItemProps={{ style: { marginBottom: 0 } }}
								/>
							</div>
						) : null}
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
							<SearchSelect
								allowClear={false}
								value={agentCode || ALL_OPTION_VALUE}
								options={agentSelectOptions}
								loading={agentOptionsLoading}
								showAvatar={false}
								searchPlaceholder={t("filters.agentSearchPlaceholder")}
								dropdownFooter={t("filters.agentOptionsCount", {
									count: agentOptions?.total ?? 0,
									formattedCount: formatNumber(agentOptions?.total ?? 0),
								})}
								classNames={{ popup: { root: styles.agentSelectPopup } }}
								optionRender={(option) => {
									const item = option.data as {
										value?: string
										label?: string
										agentCode?: string
										agentName?: string | null
									}
									if (item.value === ALL_OPTION_VALUE) {
										return (
											<div className={styles.agentOptionAll}>
												{item.label}
											</div>
										)
									}
									return (
										<div className={styles.agentOption}>
											<div className={styles.agentOptionName}>
												{displayText(item.agentName || item.label)}
											</div>
											<div className={styles.agentOptionCode}>
												{displayText(item.agentCode)}
											</div>
										</div>
									)
								}}
								onChange={(value) => {
									handleAgentCodeChange(
										!value || value === ALL_OPTION_VALUE ? "" : String(value),
									)
								}}
							/>
						</div>

						{stateView === VIEW.DigitalEmployeeAnalysis ? (
							<div className={styles.filterItem}>
								<div className={styles.filterLabel}>{t("filters.source")}</div>
								<Select
									value={agentSource}
									options={sourceOptions}
									onChange={handleAgentSourceChange}
								/>
							</div>
						) : null}
					</div>
				</section>

				<MetricGrid
					metrics={metrics}
					styles={styles}
					loading={summaryLoading}
					skeletonCount={metricSkeletonCount}
				/>
				<Visualization
					view={stateView}
					summary={summaryData}
					loading={summaryLoading}
					styles={styles}
					t={t}
					dateQuery={consumptionQuery}
				/>
				{stateView !== VIEW.ConsumptionAnalysis ? (
					<DetailSection
						view={stateView}
						activeTab={currentTab}
						tabData={tabData}
						timeRange={timeRange}
						pageSize={pageSize}
						loading={tableLoading}
						exportingTab={exportingTab}
						onTabChange={handleTabChange}
						onPageChange={handlePageChange}
						onExport={exportCurrentTab}
					/>
				) : null}
			</div>
		</div>
	)
}
