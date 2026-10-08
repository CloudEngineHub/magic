import { useDebounce } from "ahooks"
import { AlertCircle, Plus, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { Button } from "@magic-admin-v2/components/ui/button"
import { TEXT_FILTER_DEBOUNCE_MS } from "@magic-admin-v2/constants/filters"
import { ProviderAddDialog } from "@magic-admin-v2/features/platform-provider-list/components/provider-add-dialog"
import { ProviderCategoryTabs } from "@magic-admin-v2/features/platform-provider-list/components/provider-category-controls"
import { ProviderConfigDialog } from "@magic-admin-v2/features/platform-provider-list/components/provider-config-dialog"
import { ProviderListContent } from "@magic-admin-v2/features/platform-provider-list/components/provider-list-content"
import {
	useAddProviderMutation,
	useDeleteProviderMutation,
	useUpdateProviderMutation,
} from "@magic-admin-v2/features/platform-provider-list/mutations"
import {
	canDeleteProvider,
	getAccessibleProviderCategories,
	getEditableProviderCategories,
	getProviderCategoryAccess,
	resolveProviderCategory,
} from "@magic-admin-v2/features/platform-provider-list/permissions"
import {
	useProviderDetailQuery,
	useProviderListQuery,
	useProviderTemplatesQuery,
} from "@magic-admin-v2/features/platform-provider-list/queries"
import {
	providerCategory,
	type ProviderCategory,
	type ProviderFormValues,
	type ProviderListItem,
} from "@magic-admin-v2/features/platform-provider-list/types"
import {
	toAddProviderParams,
	toEditProviderParams,
	toProviderStatusUpdateParams,
} from "@magic-admin-v2/features/platform-provider-list/utils/provider-form-values"
import {
	createDefaultProviderFilterDraft,
	filterProviders,
	getProviderStatusStats,
	paginateProviders,
	providerPageSize,
	sortProviders,
	type ProviderFilterDraft,
} from "@magic-admin-v2/features/platform-provider-list/utils/provider-list"
import type { ApiError } from "@magic-admin-v2/api/types"
import { useRowPendingIds } from "@magic-admin-v2/hooks/use-row-pending-ids"
import { useRuntime } from "@magic-admin-v2/runtime/context"
import { cn } from "@magic-admin-v2/utils/cn"

export default function PlatformProviderListPage() {
	const { t } = useTranslation()
	const { access } = useRuntime()
	const categoryAccess = useMemo(() => getProviderCategoryAccess(access), [access])
	const accessibleCategories = useMemo(
		() => getAccessibleProviderCategories(categoryAccess),
		[categoryAccess],
	)
	const editableCategories = useMemo(
		() => getEditableProviderCategories(categoryAccess),
		[categoryAccess],
	)
	const [selectedCategory, setSelectedCategory] = useState<ProviderCategory | null>(null)
	const activeCategory =
		resolveProviderCategory(selectedCategory, accessibleCategories) ?? providerCategory.llm
	const currentCategoryAccess = categoryAccess[activeCategory]
	const [filterDraft, setFilterDraft] = useState(createDefaultProviderFilterDraft)
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(providerPageSize)
	const [isAddOpen, setIsAddOpen] = useState(false)
	const [addCategory, setAddCategory] = useState<ProviderCategory>(providerCategory.llm)
	const [detailId, setDetailId] = useState<string | null>(null)
	const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null)
	const { pendingIds: statusPendingIds, run: runStatusPending } = useRowPendingIds()
	const canEditAddCategory = categoryAccess[addCategory]?.canEdit ?? false
	const normalizedSearchValue = filterDraft[filterDraft.search_field].trim()
	const debouncedSearchValue = useDebounce(normalizedSearchValue, {
		wait: TEXT_FILTER_DEBOUNCE_MS,
	})
	const appliedFilter = useMemo<ProviderFilterDraft>(
		() => ({
			...filterDraft,
			[filterDraft.search_field]: normalizedSearchValue ? debouncedSearchValue : "",
		}),
		[debouncedSearchValue, filterDraft, normalizedSearchValue],
	)
	const listQuery = useProviderListQuery(activeCategory, {
		enabled: currentCategoryAccess.canView,
	})
	const detailQuery = useProviderDetailQuery(detailId, {
		enabled: deletingDetailId !== detailId,
	})
	const addTemplatesQuery = useProviderTemplatesQuery(
		addCategory,
		isAddOpen && canEditAddCategory,
	)
	const addMutation = useAddProviderMutation()
	const updateMutation = useUpdateProviderMutation()
	const deleteMutation = useDeleteProviderMutation()
	const queryError = listQuery.error as ApiError | null
	const providers = useMemo(() => sortProviders(listQuery.data ?? []), [listQuery.data])
	const filteredProviders = useMemo(
		() => filterProviders(providers, appliedFilter),
		[appliedFilter, providers],
	)
	const { currentPage, pageItems } = paginateProviders(filteredProviders, page, pageSize)
	const statusStats = useMemo(() => getProviderStatusStats(providers), [providers])
	const detailProvider = detailQuery.data ?? null
	// The detail response may omit/normalize category differently from the list row.
	// The dialog is only opened for the active category, so use that category's
	// permission for the controls and keep the provider-category check in mutations.
	const detailCanEdit = Boolean(detailProvider) && currentCategoryAccess.canEdit

	useEffect(() => {
		setPage(1)
	}, [activeCategory, appliedFilter])

	useEffect(() => {
		setIsAddOpen(false)
		setDetailId(null)
		setDeletingDetailId(null)
	}, [activeCategory])

	async function handleStatusChange(
		provider: Parameters<typeof toProviderStatusUpdateParams>[0],
		checked: boolean,
	) {
		if (!(categoryAccess[provider.category]?.canEdit ?? false)) return

		await runStatusPending(provider.id, async () => {
			try {
				await updateMutation.mutateAsync(toProviderStatusUpdateParams(provider, checked))
				toast.success(t("providerList.message.statusUpdated"))
			} catch (error) {
				toast.error(getMutationErrorMessage(error, t("common.requestFailed")))
			}
		})
	}

	async function handleAdd(
		values: ProviderFormValues,
		template: Parameters<typeof toAddProviderParams>[1],
	) {
		if (!canEditAddCategory) return

		try {
			await addMutation.mutateAsync(toAddProviderParams(values, template))
			toast.success(t("providerList.message.added"))
			setIsAddOpen(false)
		} catch (error) {
			toast.error(getMutationErrorMessage(error, t("common.requestFailed")))
		}
	}

	async function handleUpdate(
		provider: NonNullable<typeof detailProvider>,
		values: ProviderFormValues,
	) {
		if (!(categoryAccess[provider.category]?.canEdit ?? false)) return

		try {
			await updateMutation.mutateAsync(toEditProviderParams(provider, values))
			toast.success(t("providerList.message.saved"))
		} catch (error) {
			toast.error(getMutationErrorMessage(error, t("common.requestFailed")))
			throw error
		}
	}

	const executeDelete = useCallback(
		async (provider: ProviderListItem) => {
			try {
				await deleteMutation.mutateAsync(provider.id)
				toast.success(t("providerList.message.deleted"))
			} catch (error) {
				toast.error(getMutationErrorMessage(error, t("common.requestFailed")))
				throw error
			}
		},
		[deleteMutation, t],
	)

	async function handleDelete(provider: ProviderListItem) {
		if (!canDeleteProvider(categoryAccess, provider)) return

		const isDetailDelete = detailId === provider.id
		if (isDetailDelete) setDeletingDetailId(provider.id)

		try {
			await executeDelete(provider)
		} catch (error) {
			if (isDetailDelete) setDeletingDetailId(null)
			throw error
		}
	}

	if (queryError && !listQuery.data) {
		return (
			<ListShell
				actions={
					<Button onClick={() => listQuery.refetch()} variant="outline">
						<RefreshCw className="size-4" aria-hidden="true" />
						{t("common.refresh")}
					</Button>
				}
				description={t("providerList.description")}
				title={t("providerList.title")}
			>
				<ProviderCategoryTabs
					activeCategory={activeCategory}
					categories={accessibleCategories}
					onChange={setSelectedCategory}
				/>
				<div className="mt-5">
					<EmptyState
						icon={AlertCircle}
						title={t("providerList.error.loadTitle")}
						description={queryError.message}
					/>
				</div>
			</ListShell>
		)
	}

	return (
		<>
			<ListShell
				actions={
					<>
						<Button
							disabled={listQuery.isFetching}
							onClick={() => listQuery.refetch()}
							variant="outline"
						>
							<RefreshCw
								className={cn("size-4", listQuery.isFetching && "animate-spin")}
								aria-hidden="true"
							/>
							{t("common.refresh")}
						</Button>
						{currentCategoryAccess.canEdit ? (
							<Button
								onClick={() => {
									setAddCategory(activeCategory)
									setIsAddOpen(true)
								}}
							>
								<Plus className="size-4" aria-hidden="true" />
								{t("providerList.action.add")}
							</Button>
						) : null}
					</>
				}
				description={t("providerList.description")}
				title={t("providerList.title")}
			>
				<ProviderCategoryTabs
					activeCategory={activeCategory}
					categories={accessibleCategories}
					onChange={setSelectedCategory}
				/>
				<ProviderListContent
					categoryAccess={categoryAccess}
					deleting={deleteMutation.isPending}
					filter={filterDraft}
					items={pageItems}
					loading={listQuery.isFetching && !listQuery.data}
					onDelete={handleDelete}
					onFilterChange={setFilterDraft}
					onOpenDetail={(provider) => setDetailId(provider.id)}
					onPageChange={setPage}
					onPageSizeChange={(nextPageSize) => {
						setPageSize(nextPageSize)
						setPage(1)
					}}
					onStatusChange={handleStatusChange}
					page={currentPage}
					pageSize={pageSize}
					stats={statusStats}
					statusPendingIds={statusPendingIds}
					total={filteredProviders.length}
				/>
			</ListShell>

			<ProviderAddDialog
				category={addCategory}
				editableCategories={editableCategories}
				onCategoryChange={setAddCategory}
				onOpenChange={setIsAddOpen}
				onSubmit={handleAdd}
				open={isAddOpen && canEditAddCategory}
				submitting={addMutation.isPending}
				templates={addTemplatesQuery.data ?? []}
				templatesLoading={addTemplatesQuery.isLoading}
			/>
			<ProviderConfigDialog
				canEdit={detailCanEdit}
				deleting={deleteMutation.isPending}
				error={detailQuery.error as ApiError | null}
				loading={detailQuery.isLoading}
				onDelete={handleDelete}
				onOpenChange={(open) => {
					if (!open) {
						setDetailId(null)
						setDeletingDetailId(null)
					}
				}}
				onSubmit={handleUpdate}
				provider={detailProvider}
				providerId={detailId}
				saving={updateMutation.isPending}
			/>
		</>
	)
}

function getMutationErrorMessage(error: unknown, fallback: string) {
	if (typeof error === "object" && error !== null && "message" in error) {
		const message = (error as { message?: unknown }).message
		if (typeof message === "string" && message.trim()) return message
	}

	return fallback
}
