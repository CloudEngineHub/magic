import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2, Eye, Filter, ServerCog, Trash2, X } from "lucide-react"
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { CopyableValue } from "@magic-admin-v2/components/copyable-value"
import { DeleteConfirmDialog } from "@magic-admin-v2/components/delete-confirm-dialog"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import {
	FieldSearchControl,
	type FieldSearchOption,
} from "@magic-admin-v2/components/field-search-control"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { EntityAvatarRender } from "@magic-admin-v2/components/entity-avatar-render"
import { Button } from "@magic-admin-v2/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { ProviderStatusSwitch } from "@magic-admin-v2/features/platform-provider-list/components/provider-status-switch"
import {
	canDeleteProvider,
	type ProviderCategoryAccessMap,
} from "@magic-admin-v2/features/platform-provider-list/permissions"
import {
	providerSelectAllValue,
	providerStatus,
	providerType,
	type ProviderListItem,
	type ProviderTemplate,
	type ProviderType,
} from "@magic-admin-v2/features/platform-provider-list/types"
import {
	type ProviderFilterDraft,
	type ProviderSearchField,
} from "@magic-admin-v2/features/platform-provider-list/utils/provider-list"
import {
	defaultProviderIcon,
	getProviderLogoSrc,
} from "@magic-admin-v2/features/platform-provider-list/utils/provider-icons"

type ProviderStatusStats = {
	disabled: number
	enabled: number
	total: number
}

export function ProviderListContent({
	categoryAccess,
	filter,
	items,
	deleting,
	loading,
	onDelete,
	onFilterChange,
	onOpenDetail,
	onPageChange,
	onPageSizeChange,
	onStatusChange,
	page,
	pageSize,
	stats,
	statusPendingIds,
	total,
}: {
	categoryAccess: ProviderCategoryAccessMap
	deleting: boolean
	filter: ProviderFilterDraft
	items: ProviderListItem[]
	loading: boolean
	onDelete: (provider: ProviderListItem) => Promise<void>
	onFilterChange: (filter: ProviderFilterDraft) => void
	onOpenDetail: (provider: ProviderListItem) => void
	onPageChange: (page: number) => void
	onPageSizeChange: (pageSize: number) => void
	onStatusChange: (provider: ProviderListItem, checked: boolean) => Promise<void>
	page: number
	pageSize: number
	stats: ProviderStatusStats
	statusPendingIds: ReadonlySet<string>
	total: number
}) {
	const { t } = useTranslation()
	const [deleteTarget, setDeleteTarget] = useState<ProviderListItem | null>(null)
	const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
	const [mobileFilterDraft, setMobileFilterDraft] = useState<ProviderFilterDraft>(filter)
	const searchOptions = useMemo<Array<FieldSearchOption<ProviderSearchField>>>(
		() => [
			{ value: "name", label: t("providerList.filter.name") },
			{ value: "alias", label: t("providerList.filter.alias") },
			{ value: "provider_id", label: t("providerList.filter.providerId") },
		],
		[t],
	)
	const columns = useMemo<Array<ColumnDef<ProviderListItem>>>(
		() => [
			{
				id: "name",
				size: 320,
				header: t("providerList.column.name"),
				cell: ({ row }) => <ProviderNameCell provider={row.original} />,
			},
			{
				id: "status",
				size: 96,
				header: t("providerList.column.status"),
				cell: ({ row }) => {
					const provider = row.original
					const canEdit = categoryAccess[provider.category]?.canEdit ?? false

					return (
						<ProviderStatusSwitch
							disabled={!canEdit}
							loading={statusPendingIds.has(provider.id)}
							provider={provider}
							onChange={(checked) => void onStatusChange(provider, checked)}
						/>
					)
				},
			},
			{
				id: "sort",
				size: 120,
				header: t("providerList.column.sort"),
				cell: ({ row }) => <span className="text-sm">{row.original.sort ?? 0}</span>,
			},
			{
				id: "created_at",
				size: 220,
				header: t("providerList.column.createdAt"),
				cell: ({ row }) => <ProviderDateCell value={row.original.created_at} />,
			},
			{
				id: "actions",
				// size: 96,
				meta: { fitContent: true },
				header: t("providerList.column.actions"),
				cell: ({ row }) => {
					const provider = row.original
					const canEdit = categoryAccess[provider.category]?.canEdit ?? false
					const canDelete = canDeleteProvider(categoryAccess, provider)

					return (
						<div className="flex justify-end gap-2">
							<Button
								className="whitespace-nowrap md:w-auto md:gap-1.5 md:px-2.5"
								data-testid="provider-list-configure-button"
								onClick={() => onOpenDetail(provider)}
								size="icon-sm"
								variant="outline"
							>
								<Eye className="size-4" aria-hidden="true" />
								<span className="hidden md:inline">
									{t(
										canEdit
											? "providerList.action.configure"
											: "providerList.action.view",
									)}
								</span>
							</Button>
							{canDelete ? (
								<Button
									aria-label={t("common.delete")}
									data-testid="provider-list-delete-button"
									disabled={deleting}
									onClick={() => setDeleteTarget(provider)}
									size="icon-sm"
									variant="outline"
									className="text-destructive hover:text-destructive md:w-auto md:gap-1.5 md:px-2.5"
								>
									<Trash2 className="size-4" aria-hidden="true" />
									<span className="hidden md:inline">{t("common.delete")}</span>
								</Button>
							) : null}
						</div>
					)
				},
			},
		],
		[categoryAccess, deleting, onOpenDetail, onStatusChange, statusPendingIds, t],
	)

	async function confirmDelete() {
		if (!deleteTarget) return

		try {
			await onDelete(deleteTarget)
			setDeleteTarget(null)
		} catch {
			// The page reports the request error and the dialog remains open for retry.
		}
	}

	function handleMobileFilterOpenChange(open: boolean) {
		if (open) {
			setMobileFilterDraft(filter)
		}
		setMobileFilterOpen(open)
	}

	function resetMobileFilters() {
		setMobileFilterDraft({
			alias: "",
			name: "",
			provider_id: "",
			provider_type: providerSelectAllValue,
			search_field: "name",
			status: providerSelectAllValue,
		})
	}

	function applyMobileFilters() {
		onFilterChange(mobileFilterDraft)
		setMobileFilterOpen(false)
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-3">
				<ProviderStatCard
					icon={<ServerCog className="size-4" aria-hidden="true" />}
					label={t("providerList.stat.total")}
					value={stats.total}
				/>
				<ProviderStatCard
					icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
					label={t("providerList.stat.enabled")}
					value={stats.enabled}
				/>
				<ProviderStatCard
					icon={<X className="size-4" aria-hidden="true" />}
					label={t("providerList.stat.disabled")}
					value={stats.disabled}
				/>
			</div>

			<div
				className="sticky top-0 z-40 -mx-4 flex min-w-0 items-end gap-2 bg-background px-4 py-2 md:hidden lg:-mx-6 lg:px-6"
				data-testid="provider-mobile-filters"
			>
				<FilterControlField
					className="min-w-0 flex-1"
					label={t("providerList.filter.search")}
				>
					<FieldSearchControl
						selectTriggerTestId="provider-search-field-trigger"
						contentTestId="provider-search-field-content"
						optionTestId="provider-search-field-option"
						ariaLabel={t("providerList.filter.search")}
						clearLabel={t("providerList.action.clearSearch")}
						clearButtonTestId="provider-search-clear-button"
						inputValue={filter[filter.search_field]}
						inputTestId="provider-search-input"
						onInputChange={(search_value) =>
							onFilterChange({ ...filter, [filter.search_field]: search_value })
						}
						onValueChange={(search_field) =>
							onFilterChange({ ...filter, search_field })
						}
						options={searchOptions}
						placeholder={t("providerList.placeholder.search")}
						testId="provider-search-control"
						value={filter.search_field}
					/>
				</FilterControlField>
				<Button
					aria-label={t("providerList.filter.title")}
					data-testid="provider-advanced-trigger"
					onClick={() => handleMobileFilterOpenChange(true)}
					size="icon"
					variant="outline"
				>
					<Filter className="size-4" aria-hidden="true" />
				</Button>
			</div>

			<div
				className="sticky top-0 z-40 -mx-4 hidden flex-wrap items-end gap-2 bg-background px-4 py-2 md:flex lg:-mx-6 lg:px-6"
				data-testid="provider-desktop-filters"
			>
				<FilterControlField
					className="w-full min-w-0 md:w-[340px] xl:w-[420px]"
					label={t("providerList.filter.search")}
				>
					<FieldSearchControl
						selectTriggerTestId="provider-advanced-search-field-trigger"

						contentTestId="provider-advanced-search-field-content"
						optionTestId="provider-advanced-search-field-option"
						ariaLabel={t("providerList.filter.search")}
						clearLabel={t("providerList.action.clearSearch")}
						clearButtonTestId="provider-search-clear-button"
						inputValue={filter[filter.search_field]}
						inputTestId="provider-search-input"
						onInputChange={(search_value) =>
							onFilterChange({ ...filter, [filter.search_field]: search_value })
						}
						onValueChange={(search_field) =>
							onFilterChange({ ...filter, search_field })
						}
						options={searchOptions}
						placeholder={t("providerList.placeholder.search")}

						testId="provider-search-control"
						value={filter.search_field}
					/>
				</FilterControlField>
				<FilterControlField className="w-fit" label={t("providerList.filter.status")}>
					<ProviderStatusSelect
						className="w-fit max-w-full"
						testId="provider-status-trigger"
						value={filter.status}
						onChange={(status) => onFilterChange({ ...filter, status })}
					/>
				</FilterControlField>

				<FilterControlField className="w-fit" label={t("providerList.filter.providerType")}>
					<ProviderTypeSelect
						className="w-fit max-w-full"
						testId="provider-type-trigger"
						value={filter.provider_type}
						onChange={(provider_type) => onFilterChange({ ...filter, provider_type })}
					/>
				</FilterControlField>
			</div>

			<FilterSheet
				closeButtonTestId="provider-advanced-close-button"
				applyLabel={t("providerList.action.applyFilters")}
				applyButtonTestId="provider-advanced-apply-button"
				bodyTestId="provider-advanced-body"
				description={t("providerList.filter.description")}
				contentTestId="provider-advanced-content"
				onApply={applyMobileFilters}
				onOpenChange={handleMobileFilterOpenChange}
				onReset={resetMobileFilters}
				open={mobileFilterOpen}
				presentation="mobile-only"
				resetButtonTestId="provider-advanced-reset-button"
				resetLabel={t("providerList.action.reset")}
				title={t("providerList.filter.title")}
			>
				<ProviderAdvancedSearchFields
					filter={mobileFilterDraft}
					setFilter={setMobileFilterDraft}
				/>
				<FilterControlField className="w-full" label={t("providerList.filter.status")}>
					<ProviderStatusSelect
						className="w-full"
						testId="provider-advanced-status-trigger"
						value={mobileFilterDraft.status}
						onChange={(status) =>
							setMobileFilterDraft((previous) => ({ ...previous, status }))
						}
					/>
				</FilterControlField>
				<FilterControlField
					className="w-full"
					label={t("providerList.filter.providerType")}
				>
					<ProviderTypeSelect
						className="w-full"
						testId="provider-advanced-type-trigger"
						value={mobileFilterDraft.provider_type}
						onChange={(provider_type) =>
							setMobileFilterDraft((previous) => ({
								...previous,
								provider_type,
							}))
						}
					/>
				</FilterControlField>
			</FilterSheet>

			<DataTable
				columns={columns}
				containerTestId="provider-list-table"
				data={items}
				emptyState={
					<EmptyState
						icon={ServerCog}
						testId="provider-list-empty"
						title={t("providerList.empty.title")}
						description={t("providerList.empty.description")}
					/>
				}
				getRowId={(row) => row.id}
				isLoading={loading}
				loadingTestId="provider-list-loading"
				minWidth={1064}
				rowTestId="provider-list-row"
				stickyRightColumnId="actions"
			/>

			<ListPagination
				pageSizeOptionTestId="provider-list-page-size-option"
				showQuickJumper
				className="px-1"
				jumpInputTestId="provider-list-jump-input"
				onPageChange={onPageChange}
				onPageSizeChange={onPageSizeChange}
				pageSizeTriggerTestId="provider-list-page-size-trigger"
				page={page}
				pageSize={pageSize}
				previousButtonTestId="provider-list-previous-button"
				nextButtonTestId="provider-list-next-button"
				testId="provider-list-pagination"
				total={total}
			/>

			<DeleteConfirmDialog
				cancelButtonTestId="provider-delete-cancel-button"
				confirmButtonTestId="provider-delete-confirm-button"
				contentTestId="provider-delete-dialog"
				description={t("providerList.delete.description")}
				isPending={deleting}
				onConfirm={confirmDelete}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				open={deleteTarget !== null}
				title={t("providerList.delete.title")}
			/>
		</div>
	)
}

function ProviderAdvancedSearchFields({
	filter,
	setFilter,
}: {
	filter: ProviderFilterDraft
	setFilter: Dispatch<SetStateAction<ProviderFilterDraft>>
}) {
	const { t } = useTranslation()

	return (
		<>
			<FilterControlField className="w-full" label={t("providerList.filter.name")}>
				<FilterSearchInput
					clearLabel={t("providerList.action.clearSearch")}
					clearButtonTestId="provider-name-clear-button"
					inputTestId="provider-name-input"
					onValueChange={(name) => setFilter((previous) => ({ ...previous, name }))}
					placeholder={t("providerList.filter.name")}
					value={filter.name}
				/>
			</FilterControlField>
			<FilterControlField className="w-full" label={t("providerList.filter.alias")}>
				<FilterSearchInput
					clearLabel={t("providerList.action.clearSearch")}
					clearButtonTestId="provider-alias-clear-button"
					inputTestId="provider-alias-input"
					onValueChange={(alias) => setFilter((previous) => ({ ...previous, alias }))}
					placeholder={t("providerList.filter.alias")}
					value={filter.alias}
				/>
			</FilterControlField>
			<FilterControlField className="w-full" label={t("providerList.filter.providerId")}>
				<FilterSearchInput
					clearLabel={t("providerList.action.clearSearch")}
					clearButtonTestId="provider-id-clear-button"
					inputTestId="provider-id-input"
					onValueChange={(provider_id) =>
						setFilter((previous) => ({ ...previous, provider_id }))
					}
					placeholder={t("providerList.filter.providerId")}
					value={filter.provider_id}
				/>
			</FilterControlField>
		</>
	)
}

function ProviderStatCard({
	icon,
	label,
	value,
}: {
	icon: ReactNode
	label: string
	value: number
}) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="text-sm text-muted-foreground">{label}</div>
				<div className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground">
					{icon}
				</div>
			</div>
			<div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
		</div>
	)
}

function ProviderNameCell({ provider }: { provider: ProviderListItem }) {
	const { t } = useTranslation()
	const alias = provider.alias?.trim()
	const primaryName = alias || provider.name

	return (
		<div className="flex min-w-0 items-center gap-3">
			<ProviderIcon provider={provider} />
			<div className="min-w-0">
				<span className="block truncate text-sm font-medium text-foreground">
					{primaryName}
				</span>
				<span className="mt-1 block truncate text-xs text-muted-foreground">
					{provider.name}
				</span>
				<CopyableValue
					className="max-w-full"
					label={t("providerList.column.serviceProviderId")}
					value={provider.service_provider_id}
				/>
				<CopyableValue
					className="max-w-full"
					label={t("providerList.column.serviceProviderConfigId")}
					value={provider.id}
				/>
			</div>
		</div>
	)
}

export function ProviderIcon({
	provider,
	size = "md",
}: {
	provider: ProviderListItem | ProviderTemplate
	size?: "sm" | "md" | "lg"
}) {
	const iconSize = size === "lg" ? "size-12" : size === "sm" ? "size-7" : "size-9"
	const src = getProviderLogoSrc({
		code: provider.provider_code,
		icon: provider.icon,
		type: provider.provider_type,
	})

	return (
		<EntityAvatarRender
			className={iconSize}
			fallbackIcon={
				<ServerCog className={size === "lg" ? "size-5" : "size-4"} aria-hidden="true" />
			}
			fallbackImageSrc={defaultProviderIcon}
			imageClassName="object-contain p-1.5"
			name={provider.name || provider.provider_code}
			src={src || defaultProviderIcon}
		/>
	)
}

function ProviderDateCell({ value }: { value?: string }) {
	const { t } = useTranslation()

	return value ? (
		<span className="whitespace-nowrap text-sm text-muted-foreground">{value}</span>
	) : (
		<span className="text-muted-foreground">{t("common.emptyValue")}</span>
	)
}

function ProviderStatusSelect({
	className,
	onChange,
	testId,
	value,
}: {
	className?: string
	onChange: (value: string) => void
	testId?: string
	value: string
}) {
	const { t } = useTranslation()

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className} data-testid={testId}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent data-testid="platform-provider-list-filter-content">
				<SelectItem
					value={providerSelectAllValue}
					data-testid="platform-provider-list-option"
				>
					{t("common.all")}
				</SelectItem>
				<SelectItem
					value={String(providerStatus.enabled)}
					data-testid="platform-provider-list-option"
				>
					{t("providerList.status.enabled")}
				</SelectItem>
				<SelectItem
					value={String(providerStatus.disabled)}
					data-testid="platform-provider-list-option"
				>
					{t("providerList.status.disabled")}
				</SelectItem>
			</SelectContent>
		</Select>
	)
}

function ProviderTypeSelect({
	className,
	onChange,
	testId,
	value,
}: {
	className?: string
	onChange: (value: string) => void
	testId?: string
	value: string
}) {
	const { t } = useTranslation()

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className} data-testid={testId}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent data-testid="platform-provider-list-platform-provider-list-content">
				<SelectItem
					value={providerSelectAllValue}
					data-testid="platform-provider-list-option"
				>
					{t("common.all")}
				</SelectItem>
				<SelectItem
					value={String(providerType.official)}
					data-testid="platform-provider-list-option"
				>
					{getProviderTypeLabel(providerType.official, t)}
				</SelectItem>
				<SelectItem
					value={String(providerType.nonOfficial)}
					data-testid="platform-provider-list-option"
				>
					{getProviderTypeLabel(providerType.nonOfficial, t)}
				</SelectItem>
				<SelectItem
					value={String(providerType.custom)}
					data-testid="platform-provider-list-option"
				>
					{getProviderTypeLabel(providerType.custom, t)}
				</SelectItem>
			</SelectContent>
		</Select>
	)
}

function getProviderTypeLabel(type: ProviderType, t: (key: string) => string) {
	switch (type) {
		case providerType.official:
			return t("providerList.providerType.official")
		case providerType.custom:
			return t("providerList.providerType.custom")
		case providerType.nonOfficial:
		default:
			return t("providerList.providerType.nonOfficial")
	}
}
