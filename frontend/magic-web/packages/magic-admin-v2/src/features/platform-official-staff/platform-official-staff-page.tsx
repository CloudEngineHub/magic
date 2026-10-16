import { Bot, Filter, Plus, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { ConfirmDialog } from "@magic-admin-v2/components/confirm-dialog"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { ListPageSkeleton } from "@magic-admin-v2/components/list-page-skeleton"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { Button } from "@magic-admin-v2/components/ui/button"
import { PageHeaderActionButton } from "@magic-admin-v2/components/page-header-action-button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { AssignModelsDialog } from "@magic-admin-v2/features/platform-official-staff/components/assignment/assign-models-dialog"
import { OfficialStaffFormDialog } from "@magic-admin-v2/features/platform-official-staff/components/staff/official-staff-form-dialog"
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
	const { filterDraft, page, pageSize: currentPageSize, params, setDebouncedField, setFilterDraft, setPage, setPageSize } =
		useListQueryParams({
			debounceFields: ["keyword", "identifier"],
			initialDraft: createDefaultFilterDraft,
			initialPageSize: pageSize,
			toParams: toOfficialStaffListParams,
		})
	const [mobileFilterDraft, setMobileFilterDraft] = useState(createDefaultFilterDraft)
	const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
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

	function handleMobileFilterOpenChange(open: boolean) {
		if (open) {
			setMobileFilterDraft(filterDraft)
		}
		setMobileFilterOpen(open)
	}

	function resetMobileFilters() {
		setMobileFilterDraft(createDefaultFilterDraft())
	}

	function applyMobileFilters() {
		setFilterDraft((previous) => ({
			...previous,
			identifier: mobileFilterDraft.identifier,
			keyword: mobileFilterDraft.keyword,
			status: mobileFilterDraft.status,
		}))
		setMobileFilterOpen(false)
	}

	return (
		<>
			<ListShell
				testId="official-staff-page"
				actions={
					<>
						<PageHeaderActionButton onClick={handleRefresh} variant="outline" data-testid="platform-official-staff-refresh-button">
							<RefreshCw
								className={cn("size-4", listQuery.isFetching && "animate-spin")}
							/>
							{t("common.refresh")}
						</PageHeaderActionButton>
						{hasEditRight ? (
							<PageHeaderActionButton onClick={() => setStaffDialog({ open: true, staff: null })} data-testid="platform-official-staff-create-button">
								<Plus className="size-4" />
								{t("officialStaff.action.addStaff")}
							</PageHeaderActionButton>
						) : null}
					</>
				}
				description={t("nav.desc.officialStaff")}
				title={t("nav.item.officialStaff")}
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
						<div className="sticky top-0 z-40 -mx-4 flex min-w-0 items-end gap-2 bg-background px-4 py-2 md:hidden lg:-mx-6 lg:px-6">
							<FilterControlField
								className="min-w-0 flex-1"
								label={t("officialStaff.filter.keyword")}
							>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									clearButtonTestId="platform-official-staff-mobile-clear-button"
									onValueChange={(keyword) =>
			setDebouncedField("keyword", keyword)}
									placeholder={t("officialStaff.placeholder.keyword")}
									value={filterDraft.keyword}
								 inputTestId="platform-official-staff-mobile-search-input"/>
							</FilterControlField>
							<Button
								aria-label={t("officialStaff.filter.title")}
								onClick={() => handleMobileFilterOpenChange(true)}
								size="icon"
								variant="outline"
							 data-testid="platform-official-staff-filter-button">
								<Filter className="size-4" aria-hidden="true" />
							</Button>
						</div>
						<div className="sticky top-0 z-40 -mx-4 hidden min-w-0 flex-col gap-2 bg-background px-4 py-2 md:flex md:flex-row md:items-end lg:-mx-6 lg:px-6">
							<FilterControlField
								className="w-fit"
								label={t("officialStaff.filter.status")}
							>
								<Select
									onOpenChange={(open) =>
										setOpenFloatingId(open ? "staff-status-filter" : null)
									}
									onValueChange={(value) => {
										setOpenFloatingId(null)
										setFilterDraft((prev) => ({ ...prev, status: value }))
									}}
									open={openFloatingId === "staff-status-filter"}
									value={filterDraft.status}
								>
									<SelectTrigger className="w-fit max-w-full" data-testid="platform-official-staff-select-trigger">
										<SelectValue />
									</SelectTrigger>
									<SelectContent data-testid="platform-official-staff-select-content">
										<SelectItem value={selectAllValue} data-testid="platform-official-staff-option">
											{t("officialStaff.filter.allStatuses")}
										</SelectItem>
										<SelectItem value="1" data-testid="platform-official-staff-option">{t("common.enabled")}</SelectItem>
										<SelectItem value="0" data-testid="platform-official-staff-option">{t("common.disabled")}</SelectItem>
									</SelectContent>
								</Select>
							</FilterControlField>
							<FilterControlField
								className="min-w-0 flex-1 md:flex-none md:w-[340px] xl:w-[420px]"
								label={t("officialStaff.filter.keyword")}
							>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									clearButtonTestId="platform-official-staff-secondary-clear-button"
									onValueChange={(keyword) =>
			setDebouncedField("keyword", keyword)}
									placeholder={t("officialStaff.placeholder.keyword")}
									value={filterDraft.keyword}
								 inputTestId="platform-official-staff-secondary-search-input"/>
							</FilterControlField>
							<FilterControlField
								className="min-w-0 flex-1 md:flex-none md:w-[340px] xl:w-[420px]"
								label={t("officialStaff.filter.identifier")}
							>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									onValueChange={(identifier) =>
										setDebouncedField("identifier", identifier)
									}
									placeholder={t("officialStaff.placeholder.identifier")}
									value={filterDraft.identifier}
								 inputTestId="platform-official-staff-tertiary-search-input" clearButtonTestId="platform-official-staff-tertiary-search-clear-button"/>
							</FilterControlField>
						</div>
						<FilterSheet contentTestId="platform-official-staff-filter-sheet" bodyTestId="platform-official-staff-filter-body" resetButtonTestId="platform-official-staff-reset-button" applyButtonTestId="platform-official-staff-apply-button"
							closeButtonTestId="platform-official-staff-filter-close-button"
							applyLabel={t("officialStaff.action.applyFilters")}
							description={t("officialStaff.filter.description")}
							onApply={applyMobileFilters}
							onOpenChange={handleMobileFilterOpenChange}
							onReset={resetMobileFilters}
							open={mobileFilterOpen}
							presentation="mobile-only"
							resetLabel={t("officialStaff.action.reset")}
							title={t("officialStaff.filter.title")}
						>
							<FilterControlField className="w-full" label={t("officialStaff.filter.keyword")}>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									onValueChange={(keyword) =>
										setMobileFilterDraft((previous) => ({ ...previous, keyword }))
									}
									placeholder={t("officialStaff.placeholder.keyword")}
									value={mobileFilterDraft.keyword}
								 inputTestId="platform-official-staff-mobile-search-input" clearButtonTestId="platform-official-staff-mobile-search-clear-button"/>
							</FilterControlField>
							<FilterControlField
								className="w-full"
								label={t("officialStaff.filter.status")}
							>
								<Select
									onValueChange={(status) =>
										setMobileFilterDraft((previous) => ({ ...previous, status }))
									}
									value={mobileFilterDraft.status}
								>
									<SelectTrigger className="w-full" data-testid="platform-official-staff-select-trigger">
										<SelectValue />
									</SelectTrigger>
									<SelectContent data-testid="platform-official-staff-select-content">
										<SelectItem value={selectAllValue} data-testid="platform-official-staff-option">
											{t("officialStaff.filter.allStatuses")}
										</SelectItem>
										<SelectItem value="1" data-testid="platform-official-staff-option">{t("common.enabled")}</SelectItem>
										<SelectItem value="0" data-testid="platform-official-staff-option">{t("common.disabled")}</SelectItem>
									</SelectContent>
								</Select>
							</FilterControlField>
							<FilterControlField
								className="w-full"
								label={t("officialStaff.filter.identifier")}
							>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									onValueChange={(identifier) =>
										setMobileFilterDraft((previous) => ({
											...previous,
											identifier,
										}))
									}
									placeholder={t("officialStaff.placeholder.identifier")}
									value={mobileFilterDraft.identifier}
								 inputTestId="platform-official-staff-mobile-search-input" clearButtonTestId="platform-official-staff-mobile-search-clear-button"/>
							</FilterControlField>
						</FilterSheet>

						{listQuery.isLoading ? (
							<ListPageSkeleton rows={6} testId="platform-official-staff-loading" />
						) : listQuery.isError ? (
							<div className="rounded-lg border border-border/50 p-4">
								<EmptyState
									description={normalizeErrorMessage(
										listQuery.error,
										t("officialStaff.error.loadFailed"),
									)}
									icon={Bot}
									title={t("officialStaff.error.loadTitle")}
					 testId="platform-official-staff-error"/>
							</div>
						) : regularItems.length === 0 ? (
							<div className="rounded-lg border border-dashed bg-muted/20 p-4">
								<EmptyState
									description={t("officialStaff.empty.description")}
									icon={Bot}
									title={t("officialStaff.empty.title")}
								 testId="platform-official-staff-empty"/>
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
											onStatusChange={(staff, status) => {
												if (hasEditRight) setStatusDialog({ staff, status })
											}}
										/>
									))}
								</div>
								<ListPagination
									previousButtonTestId="official-staff-previous-button"
									nextButtonTestId="official-staff-next-button"
									pageSizeTriggerTestId="official-staff-page-size-trigger"
									pageSizeOptionTestId="official-staff-page-size-option"
									jumpInputTestId="official-staff-jump-input"
				testId="official-staff-pagination"
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
			</ListShell>

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
			 contentTestId="platform-official-staff-confirm-dialog-content" cancelButtonTestId="platform-official-staff-confirm-dialog-cancel-button" confirmButtonTestId="platform-official-staff-confirm-dialog-confirm-button"/>
		</>
	)
}
