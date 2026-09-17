import { Filter, Pencil, Tags, Trash2 } from "lucide-react"
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { Button } from "@magic-admin-v2/components/ui/button"
import { Input } from "@magic-admin-v2/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { Switch } from "@magic-admin-v2/components/ui/switch"
import { useRuntime } from "@magic-admin-v2/runtime/context"
import { useListQueryParams } from "@magic-admin-v2/hooks/use-list-query-params"
import { usePagination } from "@magic-admin-v2/hooks/use-pagination"
import { useSlidesTemplateCategoryMutations } from "@magic-admin-v2/features/platform-slides-template/mutations"
import { useSlidesTemplateCategoriesQuery } from "@magic-admin-v2/features/platform-slides-template/queries"
import { useRowPendingIds } from "@magic-admin-v2/features/platform-slides-template/hooks"
import {
	slidesTemplateStatus,
	type SlidesTemplateCategory,
	type SlidesTemplateCategoryQueryParams,
} from "@magic-admin-v2/features/platform-slides-template/types"
import {
	formatDateTime,
	resolveSlidesTemplateCategoryName,
	toStatus,
} from "@magic-admin-v2/features/platform-slides-template/utils"
import { CategoryDialog } from "@magic-admin-v2/features/platform-slides-template/components/category-dialog"
import { CopyableCode } from "@magic-admin-v2/features/platform-slides-template/components/copyable-code"

const emptyStatus = "all"

type CategoryFilterDraft = {
	code: string
	keyword: string
	status: string
}

function createDefaultCategoryFilterDraft(): CategoryFilterDraft {
	return { code: "", keyword: "", status: emptyStatus }
}

function toCategoryListParams(
	draft: CategoryFilterDraft,
	page: number,
	pageSize: number,
): SlidesTemplateCategoryQueryParams {
	return {
		page,
		page_size: pageSize,
		code: draft.code || undefined,
		keyword: draft.keyword || undefined,
		status: draft.status === emptyStatus ? null : (Number(draft.status) as 0 | 1),
	}
}

type CategoryManagerProps = {
	canEdit: boolean
	onDelete: (record: SlidesTemplateCategory) => void
}

export type CategoryManagerHandle = {
	create: () => void
	reset: () => void
}

export const CategoryManager = forwardRef<CategoryManagerHandle, CategoryManagerProps>(
	function CategoryManager({ canEdit, onDelete }, ref) {
		const { t } = useTranslation()
		const { language } = useRuntime()
		const { pageSize, setPageSize } = usePagination()
		const toParams = useCallback(
			(draft: CategoryFilterDraft, page: number) =>
				toCategoryListParams(draft, page, pageSize),
			[pageSize],
		)
		const { filterDraft: filters, page, params, setDebouncedField, setFilterDraft, setPage } =
			useListQueryParams({
				debounceFields: ["keyword", "code"],
				extraResetKey: pageSize,
				initialDraft: createDefaultCategoryFilterDraft,
				toParams,
			})
		const [dialogOpen, setDialogOpen] = useState(false)
		const [editing, setEditing] = useState<SlidesTemplateCategory | null>(null)
		const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
		const [advancedFilterDraft, setAdvancedFilterDraft] = useState(createDefaultCategoryFilterDraft)
		const query = useSlidesTemplateCategoriesQuery(params)
		const mutations = useSlidesTemplateCategoryMutations()
		const { pendingIds: statusPendingIds, run: runStatusPending } = useRowPendingIds()
		const { pendingIds: sortPendingIds, run: runSortPending } = useRowPendingIds()
		const create = useCallback(() => {
			if (!canEdit) return
			setEditing(null)
			setDialogOpen(true)
		}, [canEdit])

		const columns = useMemo<Array<ColumnDef<SlidesTemplateCategory>>>(
			() => [
				{
					accessorKey: "name",
					header: t("slidesTemplate.categoryName"),
					cell: ({ row }) => resolveSlidesTemplateCategoryName(row.original),
				},
				{
					accessorKey: "code",
					header: t("slidesTemplate.categoryCode"),
					cell: ({ row }) => <CopyableCode value={row.original.code} />,
				},
				{ accessorKey: "template_count", header: t("slidesTemplate.categoryCount") },
				{
					accessorKey: "status",
					header: t("slidesTemplate.status"),
					meta: { mobile: { kind: "control" } },
					cell: ({ row }) => (
						<Switch
							checked={row.original.status === slidesTemplateStatus.enabled}
							disabled={!canEdit}
							loading={statusPendingIds.has(row.original.id)}
							onCheckedChange={async (checked) => {
								try {
									await runStatusPending(row.original.id, () =>
										mutations.updateStatus.mutateAsync({
											id: row.original.id,
											status: toStatus(checked),
										}),
									)
								} catch (error) {
									toast.error(
										(error as { message?: string }).message ||
											t("common.requestFailed"),
									)
								}
							}}
						/>
					),
				},
				{
					accessorKey: "sort",
					header: t("slidesTemplate.sort"),
					cell: ({ row }) => (
						<Input
							className="h-8 w-20"
							defaultValue={row.original.sort}
							disabled={!canEdit || sortPendingIds.has(row.original.id)}
							key={`${row.original.id}-${row.original.sort}`}
							onBlur={async (event) => {
								const sort = Number(event.target.value)
								if (!Number.isFinite(sort) || sort === row.original.sort) return
								try {
									await runSortPending(row.original.id, () =>
										mutations.updateSort.mutateAsync({
											id: row.original.id,
											sort,
										}),
									)
								} catch (error) {
									toast.error(
										(error as { message?: string }).message ||
											t("common.requestFailed"),
									)
								}
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.currentTarget.blur()
							}}
							type="number"
						/>
					),
				},
				{
					accessorKey: "updated_at",
					header: t("slidesTemplate.updatedAt"),
					cell: ({ row }) =>
						formatDateTime(
							row.original.updated_at,
							language === "en_US" ? "en-US" : "zh-CN",
						),
				},
				{
					id: "actions",
					header: t("slidesTemplate.actions"),
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex gap-1">
							<Button
								aria-label={t("slidesTemplate.aria.editCategory", {
									name: resolveSlidesTemplateCategoryName(row.original),
								})}
								disabled={!canEdit}
								onClick={() => {
									setEditing(row.original)
									setDialogOpen(true)
								}}
								size="sm"
								variant="ghost"
							>
								<Pencil className="size-4" />
							</Button>
							<Button
								aria-label={t("slidesTemplate.aria.deleteCategory", {
									name: resolveSlidesTemplateCategoryName(row.original),
								})}
								disabled={!canEdit}
								onClick={() => onDelete(row.original)}
								size="sm"
								variant="ghost"
							>
								<Trash2 className="size-4 text-destructive" />
							</Button>
						</div>
					),
				},
			],
			[
				canEdit,
				language,
				mutations,
				onDelete,
				runSortPending,
				runStatusPending,
				sortPendingIds,
				statusPendingIds,
				t,
			],
		)
		const reset = useCallback(() => {
			const next = createDefaultCategoryFilterDraft()
			setFilterDraft(next)
			setAdvancedFilterDraft(next)
		}, [setFilterDraft])
		const handleFilterSheetOpenChange = useCallback(
			(open: boolean) => {
				if (open) setAdvancedFilterDraft(filters)
				setIsFilterSheetOpen(open)
			},
			[filters],
		)
		const applyAdvancedFilters = useCallback(() => {
			setFilterDraft(advancedFilterDraft)
			setIsFilterSheetOpen(false)
		}, [advancedFilterDraft, setFilterDraft])

		useImperativeHandle(ref, () => ({ create, reset }), [create, reset])

		return (
			<div className="space-y-4">
				<div className="flex min-w-0 items-end gap-2 md:hidden">
					<FilterControlField
						className="min-w-0 flex-1"
						label={t("slidesTemplate.keyword")}
					>
						<FilterSearchInput
							clearLabel={t("common.clear")}
							onValueChange={(value) => setDebouncedField("keyword", value)}
							placeholder={t("slidesTemplate.keyword")}
							value={filters.keyword}
						/>
					</FilterControlField>
					<Button
						aria-label={t("slidesTemplate.filterTitle")}
						onClick={() => handleFilterSheetOpenChange(true)}
						size="icon"
						variant="outline"
					>
						<Filter className="size-4" aria-hidden="true" />
					</Button>
				</div>
				<div className="hidden flex-wrap items-end gap-2 md:flex">
					<FilterControlField className="w-fit" label={t("slidesTemplate.status")}>
						<Select
							value={filters.status}
							onValueChange={(status) => {
								setFilterDraft((state) => ({ ...state, status }))
							}}
						>
							<SelectTrigger className="w-fit max-w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={emptyStatus}>
									{t("slidesTemplate.all")}
								</SelectItem>
								<SelectItem value="1">{t("slidesTemplate.enabled")}</SelectItem>
								<SelectItem value="0">{t("slidesTemplate.disabled")}</SelectItem>
							</SelectContent>
						</Select>
					</FilterControlField>
					<FilterControlField
						className="w-full min-w-0 md:w-[340px] xl:w-[420px]"
						label={t("slidesTemplate.keyword")}
					>
						<FilterSearchInput
							clearLabel={t("common.clear")}
							onValueChange={(value) => setDebouncedField("keyword", value)}
							placeholder={t("slidesTemplate.keyword")}
							value={filters.keyword}
						/>
					</FilterControlField>
					<FilterControlField
						className="w-full min-w-0 md:w-[340px] xl:w-[420px]"
						label={t("slidesTemplate.categoryCode")}
					>
						<FilterSearchInput
							clearLabel={t("common.clear")}
							onValueChange={(value) => setDebouncedField("code", value)}
							placeholder={t("slidesTemplate.categoryCode")}
							value={filters.code}
						/>
					</FilterControlField>
				</div>
				<FilterSheet
					applyLabel={t("slidesTemplate.applyFilters")}
					description={t("slidesTemplate.categoryFilterDescription")}
					onApply={applyAdvancedFilters}
					onOpenChange={handleFilterSheetOpenChange}
					onReset={() => setAdvancedFilterDraft(createDefaultCategoryFilterDraft())}
					open={isFilterSheetOpen}
					presentation="mobile-only"
					resetLabel={t("slidesTemplate.reset")}
					title={t("slidesTemplate.filterTitle")}
				>
					<FilterControlField className="w-full" label={t("slidesTemplate.keyword")}>
						<FilterSearchInput
							clearLabel={t("common.clear")}
							onValueChange={(keyword) =>
								setAdvancedFilterDraft((previous) => ({ ...previous, keyword }))
							}
							placeholder={t("slidesTemplate.keyword")}
							value={advancedFilterDraft.keyword}
						/>
					</FilterControlField>
					<FilterControlField className="w-full" label={t("slidesTemplate.categoryCode")}>
						<FilterSearchInput
							clearLabel={t("common.clear")}
							onValueChange={(code) =>
								setAdvancedFilterDraft((previous) => ({ ...previous, code }))
							}
							placeholder={t("slidesTemplate.categoryCode")}
							value={advancedFilterDraft.code}
						/>
					</FilterControlField>
					<FilterControlField className="w-full" label={t("slidesTemplate.status")}>
						<Select
							value={advancedFilterDraft.status}
							onValueChange={(status) =>
								setAdvancedFilterDraft((previous) => ({ ...previous, status }))
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={emptyStatus}>
									{t("slidesTemplate.all")}
								</SelectItem>
								<SelectItem value="1">{t("slidesTemplate.enabled")}</SelectItem>
								<SelectItem value="0">{t("slidesTemplate.disabled")}</SelectItem>
							</SelectContent>
						</Select>
					</FilterControlField>
				</FilterSheet>
				<div>
					<DataTable
						columns={columns}
						data={query.data?.list ?? []}
						emptyState={
							<EmptyState icon={Tags} title={t("slidesTemplate.emptyCategories")} />
						}
						getRowId={(row) => row.id}
						isLoading={query.isLoading}
						minWidth={900}
						stickyRightColumnId="actions"
					/>
					<ListPagination
						showQuickJumper
						loading={query.isFetching}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
						page={page}
						pageSize={pageSize}
						total={query.data?.total ?? 0}
					/>
				</div>
				<CategoryDialog
					editing={editing}
					mutations={mutations}
					onOpenChange={setDialogOpen}
					open={dialogOpen}
				/>
			</div>
		)
	},
)
