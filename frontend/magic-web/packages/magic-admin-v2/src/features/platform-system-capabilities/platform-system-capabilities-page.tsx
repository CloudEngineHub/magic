import { AlertCircle, Cpu, RefreshCw } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { PageHeaderActionButton } from "@magic-admin-v2/components/page-header-action-button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"
import { CapabilityCardList } from "@magic-admin-v2/features/platform-system-capabilities/components/capability-card-list"
import { CapabilityConfigDialog } from "@magic-admin-v2/features/platform-system-capabilities/components/capability-config-dialog"
import { CapabilityListSkeleton } from "@magic-admin-v2/features/platform-system-capabilities/components/capability-list-skeleton"
import { ALL_VALUE } from "@magic-admin-v2/features/platform-system-capabilities/consts"
import { useUpdateSystemCapabilityMutation } from "@magic-admin-v2/features/platform-system-capabilities/mutations"
import { useSystemCapabilityListQuery } from "@magic-admin-v2/features/platform-system-capabilities/queries"
import {
	aiPowerStatus,
	type AiPower,
} from "@magic-admin-v2/features/platform-system-capabilities/types"
import {
	getApiErrorMessage,
	getCapabilityDisplayText,
} from "@magic-admin-v2/features/platform-system-capabilities/utils"
import { useRights } from "@magic-admin-v2/hooks/use-rights"
import { useRowPendingIds } from "@magic-admin-v2/hooks/use-row-pending-ids"
import { cn } from "@magic-admin-v2/utils/cn"

export default function PlatformSystemCapabilitiesPage() {
	const { t } = useTranslation()
	const hasEditRight = useRights(PERMISSION_KEY_MAP.AI_ABILITY_MANAGEMENT_EDIT)
	const [keyword, setKeyword] = useState("")
	const [statusFilter, setStatusFilter] = useState(ALL_VALUE)
	const [configTarget, setConfigTarget] = useState<AiPower | null>(null)
	const listQuery = useSystemCapabilityListQuery()
	const updateMutation = useUpdateSystemCapabilityMutation()
	const { pendingIds: statusPendingIds, run: runStatusPending } = useRowPendingIds()
	const items = useMemo(() => {
		const search = keyword.trim().toLowerCase()
		return (listQuery.data ?? []).filter((item) => {
			const matchesKeyword =
				!search ||
				[
					getCapabilityDisplayText(item.name),
					getCapabilityDisplayText(item.description),
					item.code,
				]
					.filter(Boolean)
					.some((value) => String(value).toLowerCase().includes(search))
			const matchesStatus =
				statusFilter === ALL_VALUE ||
				item.status ===
					(statusFilter === "enabled" ? aiPowerStatus.enabled : aiPowerStatus.disabled)

			return matchesKeyword && matchesStatus
		})
	}, [keyword, listQuery.data, statusFilter])

	const handleStatusChange = useCallback(
		(item: AiPower, checked: boolean) => {
			if (!hasEditRight) return

			void runStatusPending(item.code, async () => {
				try {
					await updateMutation.mutateAsync({
						code: item.code,
						status: checked ? aiPowerStatus.enabled : aiPowerStatus.disabled,
					})
					toast.success(t("systemCapabilities.message.updateSuccess"))
				} catch (error) {
					toast.error(getApiErrorMessage(error, t("common.requestFailed")))
				}
			})
		},
		[hasEditRight, runStatusPending, t, updateMutation],
	)

	const handleConfig = useCallback(
		(item: AiPower) => {
			if (hasEditRight) setConfigTarget(item)
		},
		[hasEditRight],
	)

	return (
		<>
			<ListShell
			testId="platform-system-capabilities-page"
				actions={
					<PageHeaderActionButton
						disabled={listQuery.isFetching}
						onClick={() => listQuery.refetch()}
						variant="outline"
					 data-testid="platform-system-capabilities-refresh-button">
						<RefreshCw
							aria-hidden="true"
							className={cn("size-4", listQuery.isFetching && "animate-spin")}
						/>
						{t("common.refresh")}
					</PageHeaderActionButton>
				}
				description={t("nav.desc.systemCapabilities")}
				title={t("nav.item.systemCapabilities")}
				contentHeader={
					<div className="flex min-w-0 items-end gap-2">
						<FilterControlField
							className="min-w-0 flex-1 md:w-[280px] md:flex-none xl:w-[360px]"
							label={t("systemCapabilities.filter.keyword")}
						>
							<FilterSearchInput
								clearLabel={t("common.clear")}
								onValueChange={setKeyword}
								placeholder={t("systemCapabilities.placeholder.keyword")}
								value={keyword}
							 inputTestId="platform-system-capabilities-search-input" clearButtonTestId="platform-system-capabilities-search-clear-button"/>
						</FilterControlField>
						<FilterControlField
							className="w-[112px] shrink-0 md:w-fit"
							label={t("systemCapabilities.filter.status")}
						>
							<Select onValueChange={setStatusFilter} value={statusFilter}>
								<SelectTrigger className="w-full md:w-fit md:max-w-full" data-testid="platform-system-capabilities-select-trigger">
									<SelectValue
										placeholder={t("systemCapabilities.filter.status")}
									/>
								</SelectTrigger>
								<SelectContent data-testid="platform-system-capabilities-select-content">
									<SelectItem value={ALL_VALUE} data-testid="platform-system-capabilities-option">
										{t("systemCapabilities.filter.allStatuses")}
									</SelectItem>
									<SelectItem value="enabled" data-testid="platform-system-capabilities-option">{t("common.enabled")}</SelectItem>
									<SelectItem value="disabled" data-testid="platform-system-capabilities-option">{t("common.disabled")}</SelectItem>
								</SelectContent>
							</Select>
						</FilterControlField>
					</div>
				}
			>
				{listQuery.isLoading ? (
					<CapabilityListSkeleton testId="platform-system-capabilities-loading" />
				) : (
					<div className="space-y-4 pb-6">
						{listQuery.error ? (
							<div className="rounded-lg border border-border/50 p-4">
								<EmptyState
									description={getApiErrorMessage(
										listQuery.error,
										t("common.requestFailed"),
									)}
									icon={AlertCircle}
									title={t("systemCapabilities.error.loadTitle")}
								 testId="platform-system-capabilities-error"/>
							</div>
						) : items.length ? (
							<CapabilityCardList
								canEdit={hasEditRight}
								items={items}
								onConfig={handleConfig}
								onStatusChange={handleStatusChange}
								statusPendingIds={statusPendingIds}
							/>
						) : (
							<div className="rounded-lg border border-dashed bg-muted/20 p-4">
								<EmptyState
									description={t("systemCapabilities.empty.description")}
									icon={Cpu}
									title={t("systemCapabilities.empty.title")}
								 testId="platform-system-capabilities-empty"/>
							</div>
						)}
					</div>
				)}
			</ListShell>

			<CapabilityConfigDialog
				canEdit={hasEditRight}
				onOpenChange={(open) => {
					if (!open) setConfigTarget(null)
				}}
				open={Boolean(configTarget)}
				target={configTarget}
			/>
		</>
	)
}
