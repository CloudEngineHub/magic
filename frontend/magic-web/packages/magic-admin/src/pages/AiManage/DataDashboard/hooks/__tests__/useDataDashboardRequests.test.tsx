import { StrictMode, type ReactNode } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DataDashboard } from "@admin/types/datadashboard"
import { ORGANIZATION_TAB_TYPE, VIEW } from "../../consts"
import { useDataDashboardRequests } from "../useDataDashboardRequests"

const apiMocks = vi.hoisted(() => ({
	getDataDashboardAgentOptions: vi.fn(),
	getDataDashboardAgentSummary: vi.fn(),
	getDataDashboardMemberSummary: vi.fn(),
	getDataDashboardOrganizationSummary: vi.fn(),
	getDataDashboardConsumptionSummary: vi.fn(),
	getDataDashboardAgentTabs: vi.fn(),
	getDataDashboardMemberTabs: vi.fn(),
	getDataDashboardOrganizationTabs: vi.fn(),
}))

vi.mock("@admin/apis", () => ({
	useApis: () => ({ AIManageApi: apiMocks }),
}))

const organizationSummary: DataDashboard.OrganizationSummary = {
	level_1_department_count: 1,
	level_2_department_count: 2,
	level_3_department_count: 3,
	calling_member_count: 1,
	total_call_count: 4,
	total_points: 5,
	total_tokens: 6,
	department_statistics: [],
	usage_distribution: [],
}

const organizationTabs: DataDashboard.PagedResponse<DataDashboard.OrganizationTabRow> = {
	page: 1,
	total: 0,
	list: [],
}

const consumptionSummary: DataDashboard.ConsumptionAnalysisSummary = {
	total_call_count: 4,
	calling_member_count: 2,
	department_count: 2,
	active_agent_count: 1,
	total_points: 100,
	total_tokens: 200,
	usage_trend: [],
}

const baseQuery = {
	start_date: "2026-07-23",
	end_date: "2026-07-29",
}

function StrictModeWrapper({ children }: { children: ReactNode }) {
	return <StrictMode>{children}</StrictMode>
}

describe("useDataDashboardRequests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		apiMocks.getDataDashboardAgentOptions.mockResolvedValue({ page: 1, total: 0, list: [] })
		apiMocks.getDataDashboardOrganizationSummary.mockResolvedValue(organizationSummary)
		apiMocks.getDataDashboardOrganizationTabs.mockResolvedValue(organizationTabs)
		apiMocks.getDataDashboardConsumptionSummary.mockResolvedValue(consumptionSummary)
	})

	it("loads organization data when the initial effects are replayed by StrictMode", async () => {
		const { result } = renderHook(
			() =>
				useDataDashboardRequests({
					view: VIEW.OrganizationAnalysis,
					stateView: VIEW.OrganizationAnalysis,
					currentTab: ORGANIZATION_TAB_TYPE.Usage,
					agentQuery: baseQuery,
					memberQuery: baseQuery,
					organizationQuery: baseQuery,
					consumptionQuery: baseQuery,
					page: 1,
					pageSize: 10,
				}),
			{ wrapper: StrictModeWrapper },
		)

		await waitFor(() => expect(result.current.summaryData).toEqual(organizationSummary))
		await waitFor(() => expect(result.current.tabData).toEqual(organizationTabs))
	})

	it("only reloads tabs when the active tab changes", async () => {
		const { rerender } = renderHook(
			({ currentTab }: { currentTab: DataDashboard.OrganizationTabType }) =>
				useDataDashboardRequests({
					view: VIEW.OrganizationAnalysis,
					stateView: VIEW.OrganizationAnalysis,
					currentTab,
					agentQuery: baseQuery,
					memberQuery: baseQuery,
					organizationQuery: baseQuery,
					consumptionQuery: baseQuery,
					page: 1,
					pageSize: 10,
				}),
			{
				initialProps: {
					currentTab: ORGANIZATION_TAB_TYPE.Usage as DataDashboard.OrganizationTabType,
				},
			},
		)

		await waitFor(() =>
			expect(apiMocks.getDataDashboardOrganizationSummary).toHaveBeenCalledTimes(1),
		)
		expect(apiMocks.getDataDashboardOrganizationTabs).toHaveBeenCalledTimes(1)

		rerender({ currentTab: ORGANIZATION_TAB_TYPE.LowActivation })

		await waitFor(() =>
			expect(apiMocks.getDataDashboardOrganizationTabs).toHaveBeenCalledTimes(2),
		)
		expect(apiMocks.getDataDashboardOrganizationSummary).toHaveBeenCalledTimes(1)
		expect(apiMocks.getDataDashboardOrganizationTabs).toHaveBeenLastCalledWith({
			...baseQuery,
			tab_type: ORGANIZATION_TAB_TYPE.LowActivation,
			page: 1,
			page_size: 10,
		})
	})

	it("loads the consumption summary without requesting tabs", async () => {
		const { result } = renderHook(() =>
			useDataDashboardRequests({
				view: VIEW.ConsumptionAnalysis,
				stateView: VIEW.ConsumptionAnalysis,
				currentTab: ORGANIZATION_TAB_TYPE.Usage,
				agentQuery: baseQuery,
				memberQuery: baseQuery,
				organizationQuery: baseQuery,
				consumptionQuery: baseQuery,
				page: 1,
				pageSize: 10,
			}),
		)

		await waitFor(() => expect(result.current.summaryData).toEqual(consumptionSummary))
		expect(result.current.tableLoading).toBe(false)
		expect(result.current.tabData).toBeUndefined()
		expect(apiMocks.getDataDashboardAgentTabs).not.toHaveBeenCalled()
		expect(apiMocks.getDataDashboardMemberTabs).not.toHaveBeenCalled()
		expect(apiMocks.getDataDashboardOrganizationTabs).not.toHaveBeenCalled()
	})
})
