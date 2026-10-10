import { Eye, FileImage, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { ListFilterPanel } from "@magic-admin-v2/components/list-filter-panel"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { Badge } from "@magic-admin-v2/components/ui/badge"
import { Button } from "@magic-admin-v2/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@magic-admin-v2/components/ui/dropdown-menu"
import { Input } from "@magic-admin-v2/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { Skeleton } from "@magic-admin-v2/components/ui/skeleton"
import { Switch } from "@magic-admin-v2/components/ui/switch"
import { useRuntime } from "@magic-admin-v2/runtime/context"
import { useListQueryParams } from "@magic-admin-v2/hooks/use-list-query-params"
import { usePagination } from "@magic-admin-v2/hooks/use-pagination"
import {
	useSlidesTemplateCategoriesQuery,
	useSlidesTemplateListQuery,
	useSlidesTemplateTagsQuery,
} from "@magic-admin-v2/features/platform-slides-template/queries"
import { useSlidesTemplateMutations } from "@magic-admin-v2/features/platform-slides-template/mutations"
import { useRowPendingIds } from "@magic-admin-v2/features/platform-slides-template/hooks"
import {
	slidesTemplateSourceType,
	slidesTemplateStatus,
	type SlidesTemplate,
	type SlidesTemplateQueryParams,
} from "@magic-admin-v2/features/platform-slides-template/types"
import {
	ENABLED_SLIDES_TEMPLATE_CATEGORY_OPTIONS_QUERY,
	ENABLED_SLIDES_TEMPLATE_TAG_OPTIONS_QUERY,
	formatDateTime,
	isSystemSlidesTemplate,
	resolveSlidesTemplateCategoryName,
	resolveSlidesTemplateTagName,
	resolveSlidesTemplateTitle,
	toStatus,
} from "@magic-admin-v2/features/platform-slides-template/utils"
import { CopyableCode } from "@magic-admin-v2/features/platform-slides-template/components/copyable-code"
import { SearchableCategorySelect } from "@magic-admin-v2/features/platform-slides-template/components/searchable-category-select"
import { SearchableTagSelect } from "@magic-admin-v2/features/platform-slides-template/components/searchable-tag-select"
import { TemplateMobileCard } from "@magic-admin-v2/features/platform-slides-template/components/template-mobile-card"
import { mobileCardTokens } from "@magic-admin-v2/components/mobile-card"
import {
	CoverPreviewDialog,
	TemplatePreviewDialog,
} from "@magic-admin-v2/features/platform-slides-template/components/template-preview-dialogs"

const emptyStatus = "all"

type TemplateLibraryFilterDraft = {
	category: string
	code: string
	keyword: string
	status: string
	tagCodes: string[]
	tagMatch: "any" | "all"
}

function createDefaultTemplateLibraryDraft(): TemplateLibraryFilterDraft {
	return {
		category: "",
		code: "",
		keyword: "",
		status: emptyStatus,
		tagCodes: [],
		tagMatch: "any",
	}
}

function toTemplateLibraryParams(
	draft: TemplateLibraryFilterDraft,
	page: number,
	pageSize: number,
): SlidesTemplateQueryParams {
	return {
		page,
		page_size: pageSize,
		keyword: draft.keyword || undefined,
		code: draft.code || undefined,
		category_code: draft.category || undefined,
		tag_codes: draft.tagCodes.length ? draft.tagCodes : undefined,
		tag_match: draft.tagCodes.length ? draft.tagMatch : undefined,
		status: draft.status === emptyStatus ? null : (Number(draft.status) as 0 | 1),
	}
}

type TemplateLibraryProps = {
	canEdit: boolean
	onDelete: (record: SlidesTemplate) => void
	onEdit: (record?: SlidesTemplate) => void
}

export type TemplateLibraryHandle = {
	reset: () => void
}

export const TemplateLibrary = forwardRef<TemplateLibraryHandle, TemplateLibraryProps>(
	function TemplateLibrary({ canEdit, onDelete, onEdit }, ref) {
		const { t } = useTranslation()
		const { language } = useRuntime()
		const { pageSize, setPageSize } = usePagination()
		const toParams = useCallback(
			(draft: TemplateLibraryFilterDraft, page: number) =>
				toTemplateLibraryParams(draft, page, pageSize),
			[pageSize],
		)
		const {
			filterDraft: filters,
			page,
			params,
			setDebouncedField,
			setFilterDraft,
			setPage,
		} = useListQueryParams({
			debounceFields: ["keyword", "code"],
			extraResetKey: pageSize,
			initialDraft: createDefaultTemplateLibraryDraft,
			toParams,
		})
		const [categoryOptionsOpen, setCategoryOptionsOpen] = useState(false)
		const [tagOptionsOpen, setTagOptionsOpen] = useState(false)
		const [previewing, setPreviewing] = useState<SlidesTemplate | null>(null)
		const [coverPreviewing, setCoverPreviewing] = useState<SlidesTemplate | null>(null)
		const query = useSlidesTemplateListQuery(params)
		const categories = useSlidesTemplateCategoriesQuery(
			ENABLED_SLIDES_TEMPLATE_CATEGORY_OPTIONS_QUERY,
			categoryOptionsOpen,
		)
		const tags = useSlidesTemplateTagsQuery(
			ENABLED_SLIDES_TEMPLATE_TAG_OPTIONS_QUERY,
			tagOptionsOpen,
		)
		const tagOptions = tags.data?.list ?? []
		const mutations = useSlidesTemplateMutations()
		const { pendingIds: statusPendingIds, run: runStatusPending } = useRowPendingIds()
		const { pendingIds: sortPendingIds, run: runSortPending } = useRowPendingIds()

		const reset = useCallback(() => {
			setFilterDraft(createDefaultTemplateLibraryDraft())
		}, [setFilterDraft])

		useImperativeHandle(ref, () => ({ reset }), [reset])
		const updateStatus = useCallback(
			async (record: SlidesTemplate, checked: boolean) => {
				if (!canEdit) return
				try {
					await runStatusPending(record.id, () =>
						mutations.updateStatus.mutateAsync({
							id: record.id,
							status: toStatus(checked),
						}),
					)
				} catch (error) {
					toast.error(
						(error as { message?: string }).message || t("common.requestFailed"),
					)
				}
			},
			[canEdit, mutations.updateStatus, runStatusPending, t],
		)
		const updateSort = useCallback(
			async (record: SlidesTemplate, value: string) => {
				if (!canEdit) return
				const sort = Number(value)
				if (!Number.isFinite(sort)) return
				try {
					await runSortPending(record.id, () =>
						mutations.updateSort.mutateAsync({ id: record.id, sort }),
					)
				} catch (error) {
					toast.error(
						(error as { message?: string }).message || t("common.requestFailed"),
					)
				}
			},
			[canEdit, mutations.updateSort, runSortPending, t],
		)
		const columns = useMemo<Array<ColumnDef<SlidesTemplate>>>(
			() => [
				{
					accessorKey: "thumbnail",
					header: t("slidesTemplate.cover"),
					size: 110,
					enableSorting: false,
					cell: ({ row }) => (
						<button
							data-testid="platform-slides-template-library-action-button"
							aria-label={t("slidesTemplate.preview")}
							className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => setCoverPreviewing(row.original)}
							type="button"
						>
							{row.original.thumbnail_url ? (
								<img
									alt={resolveSlidesTemplateTitle(row.original)}
									className="h-[54px] w-24 rounded border object-cover"
									src={row.original.thumbnail_url}
								/>
							) : (
								<div className="flex h-[54px] w-24 items-center justify-center rounded border bg-muted">
									<FileImage className="size-5 text-muted-foreground" />
								</div>
							)}
						</button>
					),
				},
				{
					accessorKey: "name",
					header: t("slidesTemplate.name"),
					size: 190,
					cell: ({ row }) => (
						<div className="min-w-0">
							<div className="truncate font-medium">
								{resolveSlidesTemplateTitle(row.original)}
							</div>
							<div className="truncate text-xs text-muted-foreground">
								{row.original.label?.en_US || row.original.code}
							</div>
						</div>
					),
				},
				{
					accessorKey: "code",
					header: t("slidesTemplate.templateCode"),
					size: 165,
					cell: ({ row }) => <CopyableCode value={row.original.code} />,
				},
				{
					accessorKey: "source_type",
					header: t("slidesTemplate.source"),
					size: 105,
					cell: ({ row }) => (
						<Badge variant="outline">
							{row.original.source_type === slidesTemplateSourceType.system
								? t("slidesTemplate.system")
								: t("slidesTemplate.official")}
						</Badge>
					),
				},
				{
					accessorKey: "category",
					header: t("slidesTemplate.category"),
					size: 140,
					cell: ({ row }) =>
						row.original.category ? (
							<div className="flex items-center gap-2 whitespace-nowrap">
								<div>
									{resolveSlidesTemplateCategoryName(row.original.category)}
								</div>
								<Badge
									variant={
										row.original.category.status ===
										slidesTemplateStatus.enabled
											? "secondary"
											: "outline"
									}
								>
									{row.original.category.status === slidesTemplateStatus.enabled
										? t("slidesTemplate.enabled")
										: t("slidesTemplate.disabled")}
								</Badge>
							</div>
						) : (
							"-"
						),
				},
				{
					accessorKey: "tags",
					header: t("slidesTemplate.tags"),
					size: 180,
					enableSorting: false,
					cell: ({ row }) => (
						<div className="flex max-w-44 flex-wrap gap-1">
							{(row.original.tags ?? []).slice(0, 3).map((tag) => (
								<Badge key={tag.id} variant="secondary">
									{resolveSlidesTemplateTagName(tag)}
								</Badge>
							))}
							{(row.original.tags?.length ?? 0) > 3 ? (
								<Badge variant="outline">
									+{(row.original.tags?.length ?? 0) - 3}
								</Badge>
							) : null}
						</div>
					),
				},
				{
					accessorKey: "usage_count",
					header: t("slidesTemplate.usage"),
					size: 140,
					cell: ({ row }) => (
						<span className="whitespace-nowrap">{row.original.usage_count ?? 0}</span>
					),
				},
				{
					accessorKey: "status",
					header: t("slidesTemplate.status"),
					size: 95,
					meta: { mobile: { kind: "control" } },
					cell: ({ row }) => (
						<Switch
							checked={row.original.status === slidesTemplateStatus.enabled}
							disabled={!canEdit}
							loading={statusPendingIds.has(row.original.id)}
							onCheckedChange={(checked) => void updateStatus(row.original, checked)}
							data-testid="platform-slides-template-switch"
						/>
					),
				},
				{
					accessorKey: "sort",
					header: t("slidesTemplate.sort"),
					size: 90,
					cell: ({ row }) => (
						<Input
							className="h-8 w-20"
							defaultValue={row.original.sort}
							disabled={!canEdit || sortPendingIds.has(row.original.id)}
							key={`${row.original.id}-${row.original.sort}`}
							onBlur={(event) => {
								if (Number(event.target.value) === row.original.sort) return
								void updateSort(row.original, event.target.value)
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") event.currentTarget.blur()
							}}
							type="number"
							data-testid="platform-slides-template-input"
						/>
					),
				},
				{
					accessorKey: "updated_at",
					header: t("slidesTemplate.updatedAt"),
					size: 140,
					cell: ({ row }) =>
						formatDateTime(
							row.original.updated_at,
							language === "en_US" ? "en-US" : "zh-CN",
						),
				},
				{
					id: "actions",
					header: t("slidesTemplate.actions"),
					size: 72,
					enableSorting: false,
					meta: { fitContent: true },
					cell: ({ row }) => (
						<div className="flex justify-end">
							<DropdownMenu>
								<DropdownMenuTrigger
									asChild
									data-testid="platform-slides-template-menu-trigger"
								>
									<Button
										aria-label={t("slidesTemplate.actions")}
										size="icon"
										variant="ghost"
										data-testid="platform-slides-template-edit-button"
									>
										<MoreHorizontal className="size-4" aria-hidden="true" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									data-testid="platform-slides-template-action-button"
								>
									<DropdownMenuItem
										onSelect={() => setPreviewing(row.original)}
										data-testid="platform-slides-template-menu-item"
									>
										<Eye className="mr-2 size-4" />
										{t("slidesTemplate.preview")}
									</DropdownMenuItem>
									<DropdownMenuItem
										disabled={!canEdit || isSystemSlidesTemplate(row.original)}
										onSelect={() => onEdit(row.original)}
										data-testid="platform-slides-template-menu-item"
									>
										<Pencil className="mr-2 size-4" />
										{t("common.edit")}
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive"
										disabled={!canEdit || isSystemSlidesTemplate(row.original)}
										onSelect={() => onDelete(row.original)}
										data-testid="platform-slides-template-menu-item"
									>
										<Trash2 className="mr-2 size-4" />
										{t("slidesTemplate.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					),
				},
			],
			[
				canEdit,
				language,
				onDelete,
				onEdit,
				sortPendingIds,
				statusPendingIds,
				t,
				updateSort,
				updateStatus,
			],
		)

		return (
			<div className="space-y-4">
				<ListFilterPanel
					applyLabel={t("slidesTemplate.applyFilters")}
					createDefaultValue={createDefaultTemplateLibraryDraft}
					onApply={(draft) => setFilterDraft(draft)}
					onChange={(patch) => {
						if (patch.keyword !== undefined) setDebouncedField("keyword", patch.keyword)
						if (patch.code !== undefined) setDebouncedField("code", patch.code)
						setFilterDraft((previous) => ({ ...previous, ...patch }))
					}}
					onReset={reset}
					renderFields={({ layout, onChange, value }) => (
						<>
							<FilterControlField label={t("slidesTemplate.keyword")}>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									onValueChange={(keyword) =>
										layout === "grid"
											? setDebouncedField("keyword", keyword)
											: onChange({ keyword })
									}
									placeholder={t("slidesTemplate.keyword")}
									value={value.keyword}
								/>
							</FilterControlField>
							<FilterControlField label={t("slidesTemplate.templateCode")}>
								<FilterSearchInput
									clearLabel={t("common.clear")}
									onValueChange={(code) =>
										layout === "grid"
											? setDebouncedField("code", code)
											: onChange({ code })
									}
									placeholder={t("slidesTemplate.templateCode")}
									value={value.code}
								/>
							</FilterControlField>
							<FilterControlField label={t("slidesTemplate.category")}>
								<SearchableCategorySelect
									ariaLabel={t("slidesTemplate.category")}
									emptyLabel={t("slidesTemplate.all")}
									isLoading={categories.isLoading}
									onChange={(category) => onChange({ category })}
									onOpenChange={(open) => open && setCategoryOptionsOpen(true)}
									options={categories.data?.list ?? []}
									value={value.category}
								/>
							</FilterControlField>
							<FilterControlField label={t("slidesTemplate.tagsFilter")}>
								<SearchableTagSelect
									ariaLabel={t("slidesTemplate.tagsFilter")}
									emptyLabel={t("slidesTemplate.allTags")}
									isLoading={tags.isLoading}
									maxVisibleTags={2}
									onChange={(tagCodes) => onChange({ tagCodes })}
									onOpenChange={(open) => open && setTagOptionsOpen(true)}
									options={tagOptions}
									value={value.tagCodes}
								/>
							</FilterControlField>
							<FilterControlField label={t("slidesTemplate.status")}>
								<Select
									value={value.status}
									onValueChange={(status) => onChange({ status })}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={emptyStatus}>
											{t("slidesTemplate.all")}
										</SelectItem>
										<SelectItem value="1">
											{t("slidesTemplate.enabled")}
										</SelectItem>
										<SelectItem value="0">
											{t("slidesTemplate.disabled")}
										</SelectItem>
									</SelectContent>
								</Select>
							</FilterControlField>
							<FilterControlField label={t("slidesTemplate.tagMatch")}>
								<Select
									value={value.tagMatch}
									onValueChange={(tagMatch: "any" | "all") =>
										onChange({ tagMatch })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">
											{t("slidesTemplate.any")}
										</SelectItem>
										<SelectItem value="all">
											{t("slidesTemplate.all")}
										</SelectItem>
									</SelectContent>
								</Select>
							</FilterControlField>
						</>
					)}
					resetLabel={t("slidesTemplate.reset")}
					title={t("slidesTemplate.filterTitle")}
					value={filters}
				/>

				<div>
					<div className="hidden md:block">
						<DataTable
							columns={columns}
							data={query.data?.list ?? []}
							emptyState={
								<EmptyState
									icon={FileImage}
									title={t("slidesTemplate.empty")}
									description={t("slidesTemplate.emptyDescription")}
									testId="platform-slides-template-empty"
								/>
							}
							getRowId={(row) => row.id}
							isLoading={query.isLoading}
							minWidth={1600}
							stickyRightColumnId="actions"
							containerTestId="platform-slides-template-list"
							loadingTestId="platform-slides-template-loading"
							rowTestId="platform-slides-template-row"
						/>
					</div>
					<div className="space-y-3 md:hidden">
						{query.isLoading ? (
							Array.from({ length: 4 }, (_, index) => (
								<Skeleton className={`${mobileCardTokens.card} h-44`} key={index} />
							))
						) : (query.data?.list ?? []).length ? (
							(query.data?.list ?? []).map((record) => (
								<TemplateMobileCard
									canEdit={canEdit}
									key={record.id}
									onDelete={() => onDelete(record)}
									onEdit={() => onEdit(record)}
									onPreview={() => setPreviewing(record)}
									onStatusChange={(checked) => void updateStatus(record, checked)}
									record={record}
									statusPending={statusPendingIds.has(record.id)}
								/>
							))
						) : (
							<EmptyState
								icon={FileImage}
								title={t("slidesTemplate.empty")}
								description={t("slidesTemplate.emptyDescription")}
								testId="platform-slides-template-empty"
							/>
						)}
					</div>
					<ListPagination
						previousButtonTestId="slides-template-library-previous-button"
						nextButtonTestId="slides-template-library-next-button"
						pageSizeTriggerTestId="slides-template-library-page-size-trigger"
						pageSizeOptionTestId="slides-template-library-page-size-option"
						jumpInputTestId="slides-template-library-jump-input"
						testId="slides-template-library-pagination"
						showQuickJumper
						loading={query.isFetching}
						onPageChange={setPage}
						onPageSizeChange={setPageSize}
						page={page}
						pageSize={pageSize}
						total={query.data?.total ?? 0}
					/>
				</div>
				<TemplatePreviewDialog
					onOpenChange={(open) => !open && setPreviewing(null)}
					open={Boolean(previewing)}
					template={previewing}
				/>
				<CoverPreviewDialog
					onOpenChange={(open) => !open && setCoverPreviewing(null)}
					open={Boolean(coverPreviewing)}
					template={coverPreviewing}
				/>
			</div>
		)
	},
)
