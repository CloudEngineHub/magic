import { Bot, Plus, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { ConfirmDialog } from "@magic-admin-v2/components/confirm-dialog"
import { ListPageSkeleton } from "@magic-admin-v2/components/list-page-skeleton"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { Button } from "@magic-admin-v2/components/ui/button"
import { AssignModelsDialog } from "@magic-admin-v2/features/platform-official-staff/components/assignment/assign-models-dialog"
import { OfficialStaffFormDialog } from "@magic-admin-v2/features/platform-official-staff/components/staff/official-staff-form-dialog"
import { StaffFilters } from "@magic-admin-v2/features/platform-official-staff/components/staff/staff-filters"
import {
	DefaultSettingsCard,
	StaffCard,
} from "@magic-admin-v2/features/platform-official-staff/components/staff/staff-list"
import {
	useUpdateDefaultAgentSettingMutation,
	useUpdateOfficialStaffStatusMutation,
} from "@magic-admin-v2/features/platform-official-staff/mutations"
import {
	useAllStaffModelsQuery,
	useDefaultAgentSettingQuery,
	useEnabledOfficialStaffListQuery,
	useOfficialStaffListQuery,
} from "@magic-admin-v2/features/platform-official-staff/queries"
import { buildDefaultAgentOptions } from "@magic-admin-v2/features/platform-official-staff/utils/default-agent"
import {
	createDefaultFilterDraft,
	normalizeErrorMessage,
	pageSize,
	selectAllValue,
	type AssignDialogState,
	type FilterDraft,
	type StaffDialogState,
	type StatusDialogState,
} from "@magic-admin-v2/features/platform-official-staff/utils/page-utils"
import type { OfficialStaffListParams } from "@magic-admin-v2/features/platform-official-staff/types"
import { useI18n } from "@magic-admin-v2/i18n/use-i18n"
import { useTranslation } from "react-i18next"
import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"
import { useListQueryParams } from "@magic-admin-v2/hooks/use-list-query-params"
import { useRights } from "@magic-admin-v2/hooks/use-rights"
import { cn } from "@magic-admin-v2/utils/cn"

function OfficialStaffShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
	const { t } = useTranslation()

	return (
		<ListShell
			actions={actions}
			description={t("nav.desc.officialStaff")}
			title={t("nav.item.officialStaff")}
		>
			{children}
		</ListShell>
	)
}

function toOfficialStaffListParams(
	draft: FilterDraft,
	page: number,
	pageSize: number,
): OfficialStaffListParams {
	return {
		page,
		page_size: pageSize,
		identifier: draft.identifier || undefined,
		keyword: draft.keyword || undefined,
		status: draft.status === selectAllValue ? undefined : Number(draft.status),
	}
}

export default function PlatformOfficialStaffPage() {
	const { t } = useTranslation()
	const { language } = useI18n()
	const hasEditRight = useRights(PERMISSION_KEY_MAP.MODE_MANAGEMENT_EDIT)
	const { filterDraft, page, pageSize: currentPageSize, params, setFilterDraft, setPage, setPageSize } =
		useListQueryParams({
			debounceFields: ["keyword", "identifier"],
			initialDraft: createDefaultFilterDraft,
			initialPageSize: pageSize,
			toParams: toOfficialStaffListParams,
		})
	const [staffDialog, setStaffDialog] = useState<StaffDialogState>({ open: false, staff: null })
	const [assignDialog, setAssignDialog] = useState<AssignDialogState>({
		open: false,
		staff: null,
	})
	const [statusDialog, setStatusDialog] = useState<StatusDialogState>(null)
	const [openFloatingId, setOpenFloatingId] = useState<string | null>(null)
	const [defaultAgentCode, setDefaultAgentCode] = useState<string>()
	const defaultListParams = useMemo(
		() => ({
			page: 1,
			page_size: pageSize,
		}),
		[],
	)

	const listQuery = useOfficialStaffListQuery(params)
	const defaultListQuery = useOfficialStaffListQuery(defaultListParams)
	const enabledStaffListQuery = useEnabledOfficialStaffListQuery()
	const defaultAgentSettingQuery = useDefaultAgentSettingQuery()
	const modelQuery = useAllStaffModelsQuery()
	const statusMutation = useUpdateOfficialStaffStatusMutation()
	const updateDefaultAgentMutation = useUpdateDefaultAgentSettingMutation()

	const items = listQuery.data?.list ?? []
	const defaultConfigItem =
		defaultListQuery.data?.list.find((item) => item.is_default === 1) ??
		items.find((item) => item.is_default === 1)
	const regularItems = items.filter((item) => item.is_default !== 1)
	const total = listQuery.data?.total ?? 0
	const enabledStaffList = useMemo(
		() => enabledStaffListQuery.data ?? [],
		[enabledStaffListQuery.data],
	)
	const defaultAgentOptions = useMemo(
		() => buildDefaultAgentOptions(enabledStaffList, defaultAgentCode, language),
		[defaultAgentCode, enabledStaffList, language],
	)
	const defaultAgentSelectValue = defaultAgentOptions.some(
		(option) => option.value === defaultAgentCode,
	)
		? defaultAgentCode
		: undefined

	useEffect(() => {
		if (defaultAgentSettingQuery.data?.default_agent_code) {
			setDefaultAgentCode(defaultAgentSettingQuery.data.default_agent_code)
		}
	}, [defaultAgentSettingQuery.data])

	const handleRefresh = () => {
		void listQuery.refetch()
		void defaultListQuery.refetch()
		void enabledStaffListQuery.refetch()
		void defaultAgentSettingQuery.refetch()
		void modelQuery.refetch()
	}

	const handleDefaultAgentChange = async (nextAgentCode: string) => {
		if (!hasEditRight || !nextAgentCode || nextAgentCode === defaultAgentCode) return

		const previousAgentCode = defaultAgentCode
		setDefaultAgentCode(nextAgentCode)
		try {
			const result = await updateDefaultAgentMutation.mutateAsync({
				default_agent_code: nextAgentCode,
			})
			setDefaultAgentCode(result.default_agent_code)
			toast.success(t("officialStaff.defaultAgent.updateSuccess"))
		} catch {
			setDefaultAgentCode(previousAgentCode)
			toast.error(t("officialStaff.defaultAgent.updateFailed"))
		}
	}

	const handleStatusChange = async () => {
		if (!hasEditRight || !statusDialog) return
		try {
			await statusMutation.mutateAsync({
				id: statusDialog.staff.id,
				status: statusDialog.status,
			})
			toast.success(t("officialStaff.message.statusUpdated"))
			setStatusDialog(null)
		} catch (error) {
			toast.error(normalizeErrorMessage(error, t("officialStaff.error.statusUpdateFailed")))
		}
	}

	return (
		<>
			<OfficialStaffShell
				actions={
					<>
						<Button onClick={handleRefresh} variant="outline">
							<RefreshCw
								className={cn("size-4", listQuery.isFetching && "animate-spin")}
							/>
							{t("common.refresh")}
						</Button>
						{hasEditRight ? (
							<Button onClick={() => setStaffDialog({ open: true, staff: null })}>
								<Plus className="size-4" />
								{t("officialStaff.action.addStaff")}
							</Button>
						) : null}
					</>
				}
			>
				<div className="space-y-6">
					<DefaultSettingsCard
						canEdit={hasEditRight}
						defaultAgentCode={defaultAgentSelectValue}
						defaultAgentLoading={
							defaultAgentSettingQuery.isLoading ||
							enabledStaffListQuery.isLoading ||
							updateDefaultAgentMutation.isPending
						}
						defaultAgentOptions={defaultAgentOptions}
						defaultAgentStaffList={enabledStaffList}
						defaultConfigItem={defaultConfigItem}
						onAssign={(staff) => {
							setOpenFloatingId(null)
							setAssignDialog({ open: true, staff })
						}}
						onDefaultAgentChange={handleDefaultAgentChange}
						onFloatingOpenChange={setOpenFloatingId}
						openFloatingId={openFloatingId}
					/>

					<div className="space-y-4">
						<StaffFilters onChange={setFilterDraft} value={filterDraft} />

						{listQuery.isLoading ? (
							<ListPageSkeleton rows={6} />
						) : listQuery.isError ? (
							<div className="rounded-lg border border-border/50 p-4">
								<EmptyState
									description={normalizeErrorMessage(
										listQuery.error,
										t("officialStaff.error.loadFailed"),
									)}
									icon={Bot}
									title={t("officialStaff.error.loadTitle")}
								/>
							</div>
						) : regularItems.length === 0 ? (
							<div className="rounded-lg border border-dashed bg-muted/20 p-4">
								<EmptyState
									description={t("officialStaff.empty.description")}
									icon={Bot}
									title={t("officialStaff.empty.title")}
								/>
							</div>
						) : (
							<div className="space-y-3">
								<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									{regularItems.map((item) => (
										<StaffCard
											canEdit={hasEditRight}
											item={item}
											key={item.id}
											onAssign={(staff) => {
												setOpenFloatingId(null)
												setAssignDialog({ open: true, staff })
											}}
											onEdit={(staff) => {
												setOpenFloatingId(null)
												setStaffDialog({ open: true, staff })
											}}
											onFloatingOpenChange={setOpenFloatingId}
											openFloatingId={openFloatingId}
											onStatusChange={(staff, status) => {
												if (hasEditRight) setStatusDialog({ staff, status })
											}}
										/>
									))}
								</div>
								<ListPagination
									showQuickJumper
									className="px-1"
									loading={listQuery.isFetching}
									onPageChange={setPage}
									page={page}
									pageSize={currentPageSize}
									onPageSizeChange={setPageSize}
									total={total}
								/>
							</div>
						)}
					</div>
				</div>
			</OfficialStaffShell>

			{hasEditRight ? (
				<OfficialStaffFormDialog
					canEdit={hasEditRight}
					onOpenChange={(open) => setStaffDialog((prev) => ({ ...prev, open }))}
					open={staffDialog.open}
					staff={staffDialog.staff}
				/>
			) : null}
			<AssignModelsDialog
				allModels={modelQuery.data ?? []}
				canEdit={hasEditRight}
				modeOptions={items}
				onOpenChange={(open) => setAssignDialog((prev) => ({ ...prev, open }))}
				open={assignDialog.open}
				staff={assignDialog.staff}
			/>
			<ConfirmDialog
				open={Boolean(statusDialog)}
				onOpenChange={(open) => !open && setStatusDialog(null)}
				onConfirm={handleStatusChange}
				title={
					statusDialog?.status
						? t("officialStaff.dialog.enableTitle")
						: t("officialStaff.dialog.disableTitle")
				}
				description={
					statusDialog?.status
						? t("officialStaff.dialog.enableDescription")
						: t("officialStaff.dialog.disableDescription")
				}
				confirmLabel={t("officialStaff.action.confirm")}
				confirmDisabled={!hasEditRight}
				isPending={statusMutation.isPending}
			/>
		</>
	)
}
