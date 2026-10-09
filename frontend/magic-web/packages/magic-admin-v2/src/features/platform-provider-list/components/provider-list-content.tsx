import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2, Eye, ServerCog, Trash2, X } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { DeleteConfirmDialog } from "@magic-admin-v2/components/delete-confirm-dialog"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import {
	ListFilterPanel,
	type ListFilterPanelFieldsProps,
} from "@magic-admin-v2/components/list-filter-panel"
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
import { useIsMobile } from "@magic-admin-v2/hooks/use-is-mobile"
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
	createDefaultProviderFilterDraft,
	type ProviderFilterDraft,
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
	const isMobile = useIsMobile()
	const { t } = useTranslation()
	const [deleteTarget, setDeleteTarget] = useState<ProviderListItem | null>(null)
	const columns = useMemo<Array<ColumnDef<ProviderListItem>>>(
		() => [
			{
				id: "name",
				size: 320,
				header: t("providerList.column.name"),
				cell: ({ row }) => <ProviderNameCell provider={row.original} />,
			},
			{
				id: "id",
				size: 200,
				header: t("providerList.column.id"),
				cell: ({ row }) => <ProviderIdCell value={row.original.id} />,
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
						<div className="flex justify-end gap-1">
							<Button
								className="whitespace-nowrap"
								onClick={() => onOpenDetail(provider)}
								size="sm"
								variant="outline"
							>
								<Eye className="size-4" aria-hidden="true" />
								{!isMobile &&
									t(
										canEdit
											? "providerList.action.configure"
											: "providerList.action.view",
									)}
							</Button>
							{canDelete ? (
								<Button
									aria-label={t("common.delete")}
									disabled={deleting}
									onClick={() => setDeleteTarget(provider)}
									size="sm"
									variant="outline"
									className="text-destructive hover:text-destructive"
								>
									<Trash2 className="size-4" aria-hidden="true" />
									{!isMobile && t("common.delete")}
								</Button>
							) : null}
						</div>
					)
				},
			},
		],
		[categoryAccess, deleting, isMobile, onOpenDetail, onStatusChange, statusPendingIds, t],
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

	return (
		<>
			<div className="mt-5 grid gap-3 sm:grid-cols-3">
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

			<ListFilterPanel
				applyLabel={t("providerList.action.applyFilters")}
				className="mt-5"
				createDefaultValue={createDefaultProviderFilterDraft}
				onChange={(patch) => onFilterChange({ ...filter, ...patch })}
				onReset={() => onFilterChange(createDefaultProviderFilterDraft())}
				renderFields={(props) => <ProviderFilterFields {...props} />}
				resetLabel={t("providerList.action.reset")}
				title={t("providerList.filter.title")}
				value={filter}
			/>

			<DataTable
				columns={columns}
				containerClassName="mt-5"
				data={items}
				emptyState={
					<EmptyState
						icon={ServerCog}
						title={t("providerList.empty.title")}
						description={t("providerList.empty.description")}
					/>
				}
				getRowId={(row) => row.id}
				isLoading={loading}
				minWidth={1064}
				stickyRightColumnId="actions"
			/>

			<ListPagination
				showQuickJumper
				className="mt-4 px-1"
				onPageChange={onPageChange}
				onPageSizeChange={onPageSizeChange}
				page={page}
				pageSize={pageSize}
				total={total}
			/>

			<DeleteConfirmDialog
				description={t("providerList.delete.description")}
				isPending={deleting}
				onConfirm={confirmDelete}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				open={deleteTarget !== null}
				title={t("providerList.delete.title")}
			/>
		</>
	)
}

function ProviderFilterFields({
	onChange,
	value,
}: ListFilterPanelFieldsProps<ProviderFilterDraft>) {
	const { t } = useTranslation()

	return (
		<>
			<FilterControlField label={t("providerList.filter.name")}>
				<FilterSearchInput
					aria-label={t("providerList.filter.name")}
					clearLabel={t("providerList.action.clearSearch")}
					onValueChange={(name) => onChange({ name })}
					placeholder={t("providerList.filter.name")}
					value={value.name}
				/>
			</FilterControlField>
			<FilterControlField label={t("providerList.filter.alias")}>
				<FilterSearchInput
					aria-label={t("providerList.filter.alias")}
					clearLabel={t("providerList.action.clearSearch")}
					onValueChange={(alias) => onChange({ alias })}
					placeholder={t("providerList.filter.alias")}
					value={value.alias}
				/>
			</FilterControlField>
			<FilterControlField label={t("providerList.filter.providerCode")}>
				<FilterSearchInput
					aria-label={t("providerList.filter.providerCode")}
					clearLabel={t("providerList.action.clearSearch")}
					onValueChange={(provider_code) => onChange({ provider_code })}
					placeholder={t("providerList.filter.providerCode")}
					value={value.provider_code}
				/>
			</FilterControlField>
			<FilterControlField label={t("providerList.filter.status")}>
				<ProviderStatusSelect
					className="w-full"
					onChange={(status) => onChange({ status })}
					value={value.status}
				/>
			</FilterControlField>
			<FilterControlField label={t("providerList.filter.providerType")}>
				<ProviderTypeSelect
					className="w-full"
					onChange={(provider_type) => onChange({ provider_type })}
					value={value.provider_type}
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

function ProviderIdCell({ value }: { value: string }) {
	return (
		<span className="block truncate font-mono text-xs text-muted-foreground" title={value}>
			{value}
		</span>
	)
}

function ProviderStatusSelect({
	className,
	onChange,
	value,
}: {
	className?: string
	onChange: (value: string) => void
	value: string
}) {
	const { t } = useTranslation()

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={providerSelectAllValue}>{t("common.all")}</SelectItem>
				<SelectItem value={String(providerStatus.enabled)}>
					{t("providerList.status.enabled")}
				</SelectItem>
				<SelectItem value={String(providerStatus.disabled)}>
					{t("providerList.status.disabled")}
				</SelectItem>
			</SelectContent>
		</Select>
	)
}

function ProviderTypeSelect({
	className,
	onChange,
	value,
}: {
	className?: string
	onChange: (value: string) => void
	value: string
}) {
	const { t } = useTranslation()

	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={className}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={providerSelectAllValue}>{t("common.all")}</SelectItem>
				<SelectItem value={String(providerType.official)}>
					{getProviderTypeLabel(providerType.official, t)}
				</SelectItem>
				<SelectItem value={String(providerType.nonOfficial)}>
					{getProviderTypeLabel(providerType.nonOfficial, t)}
				</SelectItem>
				<SelectItem value={String(providerType.custom)}>
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
