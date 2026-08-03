import { useMemo } from "react"
import dayjs from "dayjs"
import { CircleHelp } from "lucide-react"
import { MagicAvatar } from "@admin-components"
import { Table, Tabs, Tooltip } from "antd"
import type { ColumnType, ColumnsType } from "antd/es/table"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import type { DataDashboard } from "@admin/types/datadashboard"
import {
	AGENT_SOURCE_TYPE,
	AGENT_TAB_TYPE,
	CSV_TITLE_BY_VIEW,
	MEMBER_TAB_TYPE,
	ORGANIZATION_TAB_TYPE,
	TABLE_PAGE_SIZE,
	TABLE_SCROLL_X,
	VIEW,
} from "../consts"
import type { DataDashboardView } from "../consts"
import type { DashboardT, DashboardTabType, DashboardRow } from "../types"
import { displayText, EMPTY_TEXT, formatNumber, formatPercent, safeDivide } from "../utils"
import { useTranslation } from "react-i18next"
import { useStyles } from "../styles"

const BUSINESS_TYPE_NAMES: Record<string, string> = {
	super_magic_task_consume: "businessTypes.superMagicTaskConsume",
	claw_project_consume: "businessTypes.clawProjectConsume",
	magic_model_consume: "businessTypes.magicModelConsume",
	normal_assistant_consume: "businessTypes.normalAssistantConsume",
	tool_consume: "businessTypes.toolConsume",
	flow_consume: "businessTypes.flowConsume",
	knowledge_vector_consume: "businessTypes.knowledgeVectorConsume",
}

const DEPARTMENT_LEVEL_LABEL_MAP: Record<DataDashboard.DepartmentLevel, string> = {
	1: "levels.level1Short",
	2: "levels.level2Short",
	3: "levels.level3Short",
}

interface DetailTimeRange {
	startDate?: string | null
	endDate?: string | null
}

interface DetailSectionProps {
	view: DataDashboardView
	activeTab: DashboardTabType
	tabData?: DataDashboard.PagedResponse<DashboardRow>
	timeRange?: DetailTimeRange | null
	pageSize: number
	loading: boolean
	onTabChange: (tab: DashboardTabType) => void
	onPageChange: (page: number, pageSize: number) => void
}

export function DetailSection({
	view,
	activeTab,
	tabData,
	timeRange,
	pageSize,
	loading,
	onTabChange,
	onPageChange,
}: DetailSectionProps) {
	const isMobile = useIsMobile()
	const { t } = useTranslation("admin/ai/dataDashboard")
	const { styles } = useStyles({ isMobile })
	const rows = useMemo(() => tabData?.list ?? [], [tabData?.list])
	const total = tabData?.total ?? 0
	const page = tabData?.page ?? 1

	const tabs = useMemo(
		() =>
			getDetailTabs({
				view,
				activeTab,
				rows,
				total,
				page,
				pageSize,
				timeRange,
				loading,
				styles,
				t,
				isMobile,
				onPageChange,
			}),
		[
			activeTab,
			isMobile,
			loading,
			onPageChange,
			page,
			pageSize,
			rows,
			styles,
			t,
			timeRange,
			total,
			view,
		],
	)

	return (
		<section className={`${styles.panel} ${styles.detailPanel}`}>
			<div className={styles.detailTop}>
				<h2 className={styles.cardTitle}>{t("detail.title")}</h2>
			</div>
			<Tabs
				activeKey={activeTab}
				className={styles.detailTabs}
				items={tabs}
				onChange={(key) => onTabChange(key as DashboardTabType)}
			/>
		</section>
	)
}

interface getDetailTabsProps {
	view: DataDashboardView
	activeTab: DashboardTabType
	rows: DashboardRow[]
	total: number
	page: number
	pageSize: number
	timeRange?: DetailTimeRange | null
	loading: boolean
	styles: Record<string, string>
	t: DashboardT
	isMobile: boolean
	onPageChange: (page: number, pageSize: number) => void
}

function getDetailTabs({
	view,
	activeTab,
	rows,
	total,
	page,
	pageSize,
	timeRange,
	loading,
	styles,
	t,
	isMobile,
	onPageChange,
}: getDetailTabsProps) {
	if (view === VIEW.DigitalEmployeeAnalysis) {
		return [
			createTabItem({
				tabType: AGENT_TAB_TYPE.Usage,
				label: t("detail.agentUsage"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: agentUsageColumns(styles, t, isMobile),
				scrollX: TABLE_SCROLL_X.Agent,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.agentUsage")}`,
				styles,
				t,
				onPageChange,
			}),
			createTabItem({
				tabType: AGENT_TAB_TYPE.Call,
				label: t("detail.agentCalls"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: callColumns(styles, t, isMobile, {
					showDigitalEmployee: true,
					showSource: true,
				}),
				scrollX: TABLE_SCROLL_X.Record,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.agentCalls")}`,
				styles,
				t,
				onPageChange,
			}),
			createTabItem({
				tabType: AGENT_TAB_TYPE.Member,
				label: t("detail.agentMembers"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: agentMemberColumns(styles, t, isMobile),
				scrollX: TABLE_SCROLL_X.MemberAgent,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.agentMembers")}`,
				styles,
				t,
				onPageChange,
			}),
			createTabItem({
				tabType: AGENT_TAB_TYPE.Department,
				label: t("detail.agentDepartments"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: agentDepartmentColumns(styles, t, isMobile),
				scrollX: TABLE_SCROLL_X.Department,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.agentDepartments")}`,
				styles,
				t,
				onPageChange,
			}),
		]
	}

	if (view === VIEW.OrganizationAnalysis) {
		return [
			createTabItem({
				tabType: ORGANIZATION_TAB_TYPE.Usage,
				label: t("detail.departmentUsage"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: organizationDepartmentColumns(styles, t, isMobile),
				scrollX: TABLE_SCROLL_X.OrganizationDepartment,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.departmentUsage")}`,
				styles,
				t,
				onPageChange,
			}),
			createTabItem({
				tabType: ORGANIZATION_TAB_TYPE.LowActivation,
				label: t("detail.lowDepartments"),
				activeTab,
				rows,
				total,
				page,
				pageSize,
				loading,
				columns: organizationDepartmentColumns(styles, t, isMobile),
				scrollX: TABLE_SCROLL_X.OrganizationDepartment,
				exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.lowDepartments")}`,
				styles,
				t,
				onPageChange,
			}),
		]
	}

	return [
		createTabItem({
			tabType: MEMBER_TAB_TYPE.Usage,
			label: t("detail.memberUsage"),
			activeTab,
			rows,
			total,
			page,
			pageSize,
			loading,
			columns: memberUsageColumns(styles, t, isMobile),
			scrollX: TABLE_SCROLL_X.Member,
			exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.memberUsage")}`,
			styles,
			t,
			onPageChange,
		}),
		createTabItem({
			tabType: MEMBER_TAB_TYPE.Call,
			label: t("detail.memberCalls"),
			activeTab,
			rows,
			total,
			page,
			pageSize,
			loading,
			columns: callColumns(styles, t, isMobile, {
				showBusinessFields: true,
				showDigitalEmployee: false,
				showSource: false,
			}),
			scrollX: TABLE_SCROLL_X.MemberRecord,
			exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.memberCalls")}`,
			styles,
			t,
			onPageChange,
		}),
		createTabItem({
			tabType: MEMBER_TAB_TYPE.Agent,
			label: t("detail.memberAgent"),
			activeTab,
			rows,
			total,
			page,
			pageSize,
			loading,
			columns: memberAgentColumns(styles, t, isMobile),
			scrollX: TABLE_SCROLL_X.MemberAgent,
			exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.memberAgent")}`,
			styles,
			t,
			onPageChange,
		}),
		createTabItem({
			tabType: MEMBER_TAB_TYPE.Silent,
			label: t("detail.silentMembers"),
			activeTab,
			rows,
			total,
			page,
			pageSize,
			loading,
			columns: silentMemberColumns(styles, t, isMobile, timeRange),
			scrollX: TABLE_SCROLL_X.SilentMembers,
			exportTitle: `${CSV_TITLE_BY_VIEW[view]}-${t("detail.silentMembers")}`,
			styles,
			t,
			onPageChange,
		}),
	]
}

function createTabItem({
	tabType,
	label,
	activeTab,
	rows,
	total,
	page,
	pageSize,
	loading,
	columns,
	scrollX,
	exportTitle,
	styles,
	t,
	onPageChange,
}: {
	tabType: DashboardTabType
	label: string
	activeTab: DashboardTabType
	rows: DashboardRow[]
	total: number
	page: number
	pageSize: number
	loading: boolean
	columns: ColumnsType<DashboardRow>
	scrollX: number
	exportTitle: string
	styles: Record<string, string>
	t: DashboardT
	onPageChange: (page: number, pageSize: number) => void
}) {
	return {
		key: tabType,
		label,
		children:
			activeTab === tabType ? (
				<div className={styles.detailTabContent}>
					<div className={styles.detailTableTop}>
						<h3 className={styles.detailSubtitle}>{label}</h3>
						{/* <MagicButton
							icon={<Download size={16} />}
							onClick={() =>
								exportCsv(
									exportTitle,
									rows as unknown as Array<Record<string, unknown>>,
								)
							}
						>
							{t("actions.export")}
						</MagicButton> */}
					</div>
					<div className={styles.detailTableWrap}>
						<Table<DashboardRow>
							rowKey={(row) => getRowKey(tabType, row)}
							scroll={{ x: scrollX, scrollToFirstRowOnChange: false }}
							columns={columns}
							dataSource={rows}
							loading={loading}
							pagination={{
								current: page,
								pageSize,
								total,
								showSizeChanger: true,
								pageSizeOptions: [String(TABLE_PAGE_SIZE), "50", "100"],
								onChange: onPageChange,
							}}
						/>
					</div>
				</div>
			) : null,
	}
}

function agentUsageColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "digitalEmployee",
			dataIndex: "agent_name",
			width: 300,
			fixed: isMobile ? undefined : "left",
			render: (_, row) => renderAgent(styles, row),
			sortValue: (row) => getAgentSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "source",
			dataIndex: "source_type",
			width: 130,
			render: (value) => sourceTypeLabel(value, t),
			sortValue: (row) =>
				sourceTypeLabel((row as DataDashboard.AgentUsageRow).source_type, t),
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "members",
			dataIndex: "member_count",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "departments",
			dataIndex: "department_count",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "averageAmount",
			width: 150,
			render: (_, row) => renderAverageNumber(row, "points"),
			sortValue: (row) => getAverageValue(row, "points"),
		}),
		createDetailColumn(styles, t, {
			titleKey: "averageTokens",
			width: 160,
			render: (_, row) => renderAverageNumber(row, "tokens"),
			sortValue: (row) => getAverageValue(row, "tokens"),
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: 200,
			render: displayText,
		}),
	]
}

function callColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
	{
		showBusinessFields = false,
		showDigitalEmployee = true,
		showSource = false,
	}: {
		showBusinessFields?: boolean
		showDigitalEmployee?: boolean
		showSource?: boolean
	},
): ColumnsType<DashboardRow> {
	const columns: ColumnsType<DashboardRow> = [
		createDetailColumn(styles, t, {
			titleKey: "updatedAt",
			dataIndex: "last_called_at",
			width: 200,
			fixed: isMobile ? undefined : "left",
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "member",
			dataIndex: "user_name",
			width: 310,
			render: (_, row) => renderMember(styles, row),
			sortValue: (row) => getMemberSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			dataIndex: "department_name_path",
			width: 180,
			ellipsis: { showTitle: true },
			render: displayText,
		}),
	]

	if (showDigitalEmployee) {
		columns.push(
			createDetailColumn(styles, t, {
				titleKey: "digitalEmployee",
				dataIndex: "agent_name",
				width: 180,
				render: (_, row) => renderAgent(styles, row),
				sortValue: (row) => getAgentSortName(row),
			}),
		)
	}

	if (showBusinessFields) {
		columns.push(
			createDetailColumn(styles, t, {
				titleKey: "businessType",
				dataIndex: "business_type",
				width: 160,
				render: (value) => businessTypeLabel(value, t),
				sortValue: (row) =>
					businessTypeLabel((row as DataDashboard.MemberCallRow).business_type, t),
			}),
			createDetailColumn(styles, t, {
				titleKey: "resourceType",
				dataIndex: "resource_type",
				width: 160,
				render: (_, row) => renderResource(styles, row),
				sortValue: (row) =>
					(row as DataDashboard.MemberCallRow).resource_type ||
					(row as DataDashboard.MemberCallRow).resource_id,
			}),
		)
	}

	if (showSource) {
		columns.push(
			createDetailColumn(styles, t, {
				titleKey: "source",
				dataIndex: "source_type",
				width: 110,
				render: (value) => sourceTypeLabel(value, t),
				sortValue: (row) =>
					sourceTypeLabel((row as DataDashboard.AgentCallRow).source_type, t),
			}),
		)
	}

	columns.push(
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: 110,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: 130,
			render: renderNumber,
		}),
	)

	return columns
}

function agentMemberColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "digitalEmployee",
			dataIndex: "agent_name",
			width: 190,
			fixed: isMobile ? undefined : "left",
			render: (_, row) => renderAgent(styles, row),
			sortValue: (row) => getAgentSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "member",
			dataIndex: "user_name",
			width: 300,
			render: (_, row) => renderMember(styles, row),
			sortValue: (row) => getMemberSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			dataIndex: "department_name_path",
			width: 210,
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "source",
			dataIndex: "source_type",
			width: 130,
			render: (value) => sourceTypeLabel(value, t),
			sortValue: (row) =>
				sourceTypeLabel((row as DataDashboard.AgentMemberRow).source_type, t),
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: 110,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: 200,
			render: displayText,
		}),
	]
}

function agentDepartmentColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "digitalEmployee",
			dataIndex: "agent_name",
			width: 190,
			fixed: isMobile ? undefined : "left",
			render: (_, row) => renderAgent(styles, row),
			sortValue: (row) => getAgentSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			dataIndex: "department_name_path",
			width: 260,
			ellipsis: true,
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "source",
			dataIndex: "source_type",
			width: 130,
			render: (value) => sourceTypeLabel(value, t),
			sortValue: (row) =>
				sourceTypeLabel((row as DataDashboard.AgentDepartmentRow).source_type, t),
		}),
		createDetailColumn(styles, t, {
			titleKey: "members",
			dataIndex: "member_count",
			width: 120,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: 110,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: 170,
			render: displayText,
		}),
	]
}

function organizationDepartmentColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "departmentLevel",
			dataIndex: "department_level",
			width: 120,
			fixed: isMobile ? undefined : "left",
			render: (value) => renderDepartmentLevel(value, t),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			helperKey: "organizationDepartment",
			dataIndex: "level_1_department_name",
			width: 180,
			fixed: isMobile ? undefined : "left",
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "level2Department",
			dataIndex: "level_2_department_name",
			width: 180,
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "level3Department",
			dataIndex: "level_3_department_name",
			width: 200,
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "employeeCount",
			dataIndex: "employed_member_count",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "activeMembers",
			dataIndex: "active_member_count",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "activationRate",
			width: 140,
			render: (_, row) => renderDepartmentActivationRate(row),
			sortValue: (row) => getDepartmentActivationRate(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: 120,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: 130,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: 140,
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: 180,
			render: displayText,
		}),
	]
}

function memberUsageColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "member",
			dataIndex: "user_name",
			fixed: isMobile ? undefined : "left",
			width: "30%",
			render: (_, row) => renderMember(styles, row),
			sortValue: (row) => getMemberSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			dataIndex: "department_name_path",
			width: "20%",
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: "10%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "usageDays",
			dataIndex: "usage_days",
			width: "10%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: "10%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: "14%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "averageAmount",
			width: "14%",
			render: (_, row) => renderAverageNumber(row, "points"),
			sortValue: (row) => getAverageValue(row, "points"),
		}),
		createDetailColumn(styles, t, {
			titleKey: "averageTokens",
			width: "16%",
			render: (_, row) => renderAverageNumber(row, "tokens"),
			sortValue: (row) => getAverageValue(row, "tokens"),
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: "18%",
			render: displayText,
		}),
	]
}

function memberAgentColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "member",
			dataIndex: "user_name",
			width: "32%",
			fixed: isMobile ? undefined : "left",
			render: (_, row) => renderMember(styles, row),
			sortValue: (row) => getMemberSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "digitalEmployee",
			dataIndex: "agent_name",
			width: "20%",
			render: (_, row) => renderAgent(styles, row),
			sortValue: (row) => getAgentSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "calls",
			dataIndex: "call_count",
			width: "12%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "amount",
			dataIndex: "points",
			width: "12%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "tokens",
			dataIndex: "tokens",
			width: "16%",
			render: renderNumber,
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: "20%",
			render: displayText,
		}),
	]
}

function silentMemberColumns(
	styles: Record<string, string>,
	t: DashboardT,
	isMobile: boolean,
	timeRange?: DetailTimeRange | null,
): ColumnsType<DashboardRow> {
	return [
		createDetailColumn(styles, t, {
			titleKey: "member",
			dataIndex: "user_name",
			width: "32%",
			fixed: isMobile ? undefined : "left",
			render: (_, row) => renderMember(styles, row),
			sortValue: (row) => getMemberSortName(row),
		}),
		createDetailColumn(styles, t, {
			titleKey: "department",
			dataIndex: "department_name_path",
			width: "20%",
			ellipsis: { showTitle: true },
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "status",
			dataIndex: "status",
			width: "20%",
			render: (value) => memberStatusLabel(value, t),
			sortValue: (row) => memberStatusLabel((row as DataDashboard.MemberSilentRow).status, t),
		}),
		createDetailColumn(styles, t, {
			titleKey: "lastUsedAt",
			dataIndex: "last_called_at",
			width: "20%",
			render: displayText,
		}),
		createDetailColumn(styles, t, {
			titleKey: "silentDays",
			width: "16%",
			render: (_, row) => renderSilentDays(row, timeRange),
			sortValue: (row) => getSilentDays(row, timeRange),
		}),
	]
}

interface DetailColumnConfig extends Omit<ColumnType<DashboardRow>, "title" | "sorter"> {
	titleKey: string
	helperKey?: string
	sortValue?: (row: DashboardRow) => unknown
}

function createDetailColumn(
	styles: Record<string, string>,
	t: DashboardT,
	{ titleKey, helperKey = titleKey, sortValue, ...column }: DetailColumnConfig,
): ColumnType<DashboardRow> {
	const dataIndex = typeof column.dataIndex === "string" ? column.dataIndex : undefined

	return {
		...column,
		title: renderColumnTitle(styles, t(`columns.${titleKey}`), t(`columnHelpers.${helperKey}`)),
		sorter: createSorter(
			sortValue ??
				((row) =>
					dataIndex ? (row as unknown as Record<string, unknown>)[dataIndex] : undefined),
		),
		sortDirections: ["descend", "ascend"],
		showSorterTooltip: false,
	}
}

function renderColumnTitle(styles: Record<string, string>, label: string, helper: string) {
	return (
		<span className={styles.columnTitle}>
			<span className={styles.columnTitleText}>{label}</span>
			<Tooltip title={helper}>
				<span
					className={styles.columnHelpIcon}
					onClick={(event) => event.stopPropagation()}
				>
					<CircleHelp size={13} />
				</span>
			</Tooltip>
		</span>
	)
}

function createSorter(getValue: (row: DashboardRow) => unknown) {
	return (a: DashboardRow, b: DashboardRow) => compareValues(getValue(a), getValue(b))
}

function compareValues(left: unknown, right: unknown) {
	const normalizedLeft = normalizeSortValue(left)
	const normalizedRight = normalizeSortValue(right)

	if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
		return normalizedLeft - normalizedRight
	}

	return String(normalizedLeft).localeCompare(String(normalizedRight), "zh-CN", {
		numeric: true,
		sensitivity: "base",
	})
}

function normalizeSortValue(value: unknown) {
	if (value === null || value === undefined || value === "") return ""
	if (typeof value === "number") return value

	const text = String(value)
	if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
		const timestamp = Date.parse(text)
		if (Number.isFinite(timestamp)) return timestamp
	}

	return text
}

function renderMember(styles: Record<string, string>, row: DashboardRow) {
	const member = row as Partial<DataDashboard.MemberUsageRow>
	return renderEntity(styles, member.user_name, member.user_id)
}

function renderAgent(styles: Record<string, string>, row: DashboardRow) {
	const agent = row as Partial<DataDashboard.AgentUsageRow>
	return renderEntity(styles, agent.agent_name, agent.agent_code)
}

function renderDepartment(styles: Record<string, string>, row: DashboardRow) {
	const department = row as Partial<DataDashboard.AgentDepartmentRow>
	return renderEntity(styles, department.department_name_path, department.department_id)
}

function renderEntity(styles: Record<string, string>, name?: string | null, meta?: string | null) {
	const displayName = displayText(name)
	const avatarText = displayName === EMPTY_TEXT ? EMPTY_TEXT : displayName.slice(0, 1)

	return (
		<div className={styles.entityCell}>
			<MagicAvatar shape="circle" size={30}>
				{avatarText}
			</MagicAvatar>
			<div>
				<div className={styles.entityName}>{displayName}</div>
				<div className={styles.entityMeta}>{displayText(meta)}</div>
			</div>
		</div>
	)
}

function renderResource(styles: Record<string, string>, row: DashboardRow) {
	const item = row as DataDashboard.MemberCallRow
	return (
		<div className={styles.resourceCell}>
			<div className={styles.resourcePrimary}>{displayText(item.resource_type)}</div>
			<div className={styles.resourceMeta}>{displayText(item.resource_id)}</div>
		</div>
	)
}

function renderNumber(value: unknown) {
	return formatNumber(Number(value))
}

function renderDepartmentLevel(value: unknown, t: DashboardT) {
	const level = Number(value) as DataDashboard.DepartmentLevel
	const labelKey = DEPARTMENT_LEVEL_LABEL_MAP[level]
	return labelKey ? t(labelKey) : displayText(value)
}

function renderDepartmentActivationRate(row: DashboardRow) {
	return formatPercent(getDepartmentActivationRate(row))
}

function renderAverageNumber(row: DashboardRow, field: "points" | "tokens") {
	return formatNumber(getAverageValue(row, field))
}

function renderSilentDays(row: DashboardRow, timeRange?: DetailTimeRange | null) {
	const silentDays = getSilentDays(row, timeRange)
	return silentDays === null ? EMPTY_TEXT : formatNumber(silentDays)
}

interface RowWithAverageFields {
	call_count?: number | null
	points?: number | null
	tokens?: number | null
}

function getAverageValue(row: DashboardRow, field: "points" | "tokens") {
	const item = row as RowWithAverageFields
	return safeDivide(Number(item[field] ?? 0), Number(item.call_count ?? 0))
}

function getDepartmentActivationRate(row: DashboardRow) {
	const item = row as Partial<DataDashboard.OrganizationDepartmentRow>
	return safeDivide(
		Number(item.active_member_count ?? 0),
		Number(item.employed_member_count ?? 0),
	)
}

function getSilentDays(row: DashboardRow, timeRange?: DetailTimeRange | null) {
	const endDate = normalizeDate(timeRange?.endDate)
	if (!endDate) return null

	const lastCalledAt = (row as Partial<DataDashboard.MemberSilentRow>).last_called_at
	if (lastCalledAt) {
		const lastCalledDate = normalizeDate(lastCalledAt)
		if (!lastCalledDate) return null
		return Math.max(endDate.diff(lastCalledDate, "day"), 0)
	}

	const startDate = normalizeDate(timeRange?.startDate)
	if (!startDate) return null
	return Math.max(endDate.diff(startDate, "day") + 1, 0)
}

function normalizeDate(value?: string | null) {
	if (!value) return null
	const date = dayjs(value)
	return date.isValid() ? date.startOf("day") : null
}

function getMemberSortName(row: DashboardRow) {
	const member = row as Partial<DataDashboard.MemberUsageRow>
	return member.user_name || member.user_id
}

function getAgentSortName(row: DashboardRow) {
	const agent = row as Partial<DataDashboard.AgentUsageRow>
	return agent.agent_name || agent.agent_code
}

function getRowKey(tabType: DashboardTabType, row: DashboardRow) {
	if (tabType === AGENT_TAB_TYPE.Usage) {
		return (row as DataDashboard.AgentUsageRow).agent_code
	}
	if (tabType === AGENT_TAB_TYPE.Call || tabType === MEMBER_TAB_TYPE.Call) {
		return (row as DataDashboard.AgentCallRow).task_id
	}
	if (tabType === AGENT_TAB_TYPE.Member) {
		const item = row as DataDashboard.AgentMemberRow
		return `${item.agent_code}-${item.user_id}`
	}
	if (tabType === AGENT_TAB_TYPE.Department) {
		const item = row as DataDashboard.AgentDepartmentRow
		return `${item.agent_code}-${item.department_id}`
	}
	if (tabType === MEMBER_TAB_TYPE.Agent) {
		const item = row as DataDashboard.MemberAgentRow
		return `${item.user_id}-${item.agent_code}`
	}
	if (
		tabType === ORGANIZATION_TAB_TYPE.Usage ||
		tabType === ORGANIZATION_TAB_TYPE.LowActivation
	) {
		return (row as DataDashboard.OrganizationDepartmentRow).department_id
	}
	return (row as DataDashboard.MemberUsageRow).user_id
}

function sourceTypeLabel(value: unknown, t: DashboardT) {
	if (value === AGENT_SOURCE_TYPE.LocalCreate) return t("sourceTypes.localCreate")
	if (value === AGENT_SOURCE_TYPE.Market) return t("sourceTypes.market")
	if (value === AGENT_SOURCE_TYPE.Organization) return t("sourceTypes.organization")
	return displayText(value as string | null)
}

function businessTypeLabel(value: unknown, t: DashboardT) {
	const businessType = typeof value === "string" ? value : ""
	const businessTypeNameKey = businessType ? BUSINESS_TYPE_NAMES[businessType] : undefined
	if (businessTypeNameKey) return t(businessTypeNameKey)
	return displayText(value as string | null)
}

function memberStatusLabel(value: unknown, t: DashboardT) {
	if (value === 0) return t("memberStatus.frozen")
	if (value === 1) return t("memberStatus.activated")
	if (value === 2) return t("memberStatus.resigned")
	if (value === 3) return t("memberStatus.exited")
	return displayText(value as string | number | null)
}
