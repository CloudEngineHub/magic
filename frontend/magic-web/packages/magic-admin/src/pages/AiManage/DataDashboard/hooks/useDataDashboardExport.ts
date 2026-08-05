import { useEffect, useRef, useState } from "react"
import { message } from "antd"
import { useMemoizedFn, useUnmount } from "ahooks"
import { useTranslation } from "react-i18next"
import { useApis } from "@admin/apis"
import type { DataDashboard } from "@admin/types/datadashboard"
import {
	DATA_DASHBOARD_EXPORT_MAX_WAIT_TIME,
	DATA_DASHBOARD_EXPORT_POLL_INTERVAL,
	VIEW,
	type DataDashboardView,
} from "../consts"
import type { DashboardTabType } from "../types"

const waitForNextPoll = (delay: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, delay)
	})

const getErrorMessage = (error: unknown, fallback: string) => {
	if (error instanceof Error && error.message) return error.message
	if (typeof error === "object" && error !== null && "message" in error) {
		const errorMessage = (error as { message?: unknown }).message
		if (typeof errorMessage === "string" && errorMessage) return errorMessage
	}
	return fallback
}

export function useDataDashboardExport({
	view,
	currentTab,
	agentQuery,
	memberQuery,
	organizationQuery,
}: {
	view: DataDashboardView
	currentTab: DashboardTabType
	agentQuery: DataDashboard.AgentSummaryQuery
	memberQuery: DataDashboard.MemberSummaryQuery
	organizationQuery: DataDashboard.OrganizationSummaryQuery
}) {
	const { AIManageApi } = useApis()
	const { t } = useTranslation("admin/ai/dataDashboard")
	const [exportingTab, setExportingTab] = useState<DashboardTabType | null>(null)
	const exportingRef = useRef(false)
	const activeExportRef = useRef(0)

	useEffect(() => {
		activeExportRef.current += 1
		exportingRef.current = false
		setExportingTab(null)
	}, [view])

	useUnmount(() => {
		activeExportRef.current += 1
	})

	const exportCurrentTab = useMemoizedFn(async () => {
		if (exportingRef.current) return

		const exportTab = currentTab
		exportingRef.current = true
		setExportingTab(exportTab)
		const activeExport = ++activeExportRef.current
		const exportDeadline = Date.now() + DATA_DASHBOARD_EXPORT_MAX_WAIT_TIME

		try {
			let payload: DataDashboard.DashboardExportRequest
			let created: DataDashboard.DashboardExportCreated

			if (view === VIEW.DigitalEmployeeAnalysis) {
				payload = { ...agentQuery, tab_type: exportTab }
				created = await AIManageApi.createDataDashboardAgentExport(payload)
			} else if (view === VIEW.MemberAnalysis) {
				payload = { ...memberQuery, tab_type: exportTab }
				created = await AIManageApi.createDataDashboardMemberExport(payload)
			} else if (view === VIEW.OrganizationAnalysis) {
				payload = { ...organizationQuery, tab_type: exportTab }
				created = await AIManageApi.createDataDashboardOrganizationExport(payload)
			} else {
				throw new Error(t("export.failed"))
			}

			while (activeExportRef.current === activeExport) {
				if (Date.now() >= exportDeadline) throw new Error(t("export.timeout"))

				const task = await AIManageApi.getDataDashboardExportTask(created.export_id)
				if (activeExportRef.current !== activeExport) return
				if (Date.now() >= exportDeadline) throw new Error(t("export.timeout"))

				if (task.status === "pending" || task.status === "processing") {
					const remainingWaitTime = exportDeadline - Date.now()
					if (remainingWaitTime <= 0) throw new Error(t("export.timeout"))
					await waitForNextPoll(
						Math.min(DATA_DASHBOARD_EXPORT_POLL_INTERVAL, remainingWaitTime),
					)
					continue
				}

				if (task.status === "completed" && task.download_url) {
					message.success(t("export.completed"))
					window.location.href = task.download_url
					return
				}

				if (task.status === "expired") {
					throw new Error(t("export.expired"))
				}

				throw new Error(task.error_message || t("export.failed"))
			}
		} catch (error) {
			if (activeExportRef.current === activeExport) {
				message.error(getErrorMessage(error, t("export.failed")))
			}
		} finally {
			if (activeExportRef.current === activeExport) {
				exportingRef.current = false
				setExportingTab(null)
			}
		}
	})

	return { exportingTab, exportCurrentTab }
}
