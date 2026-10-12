import type { ColumnDef } from "@tanstack/react-table"
import { AlertCircle, BrainCircuit, Eye, Filter, Pencil, Plus, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { EntityAvatarRender } from "@magic-admin-v2/components/entity-avatar-render"
import { CopyableValue } from "@magic-admin-v2/components/copyable-value"
import { Badge } from "@magic-admin-v2/components/ui/badge"
import { Button } from "@magic-admin-v2/components/ui/button"
import { PageHeaderActionButton } from "@magic-admin-v2/components/page-header-action-button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@magic-admin-v2/components/ui/tabs"
import { useProviderModelDataSource } from "@magic-admin-v2/features/platform-model-list/utils/data-source"
import { ModelEditorDialog } from "@magic-admin-v2/features/platform-model-list/components/model-editor-dialog"
import { DefaultModelIcon } from "@magic-admin-v2/features/platform-model-list/components/default-model-icon"
import { MultiSelectFilter } from "@magic-admin-v2/features/platform-model-list/components/multi-select-filter"
import {
	CategoryBadge,
	ModelDetailDialog,
	ModelTypeBadge,
} from "@magic-admin-v2/features/platform-model-list/components/model-detail-dialog"
import {
	getAccessibleProviderModelCategories,
	getEditableProviderModelCategories,
	getProviderModelAccessCategory,
	getProviderModelCategoryAccess,
} from "@magic-admin-v2/features/platform-model-list/utils/permissions"
import { useProviderModelGroupsQuery } from "@magic-admin-v2/features/platform-model-list/queries"
import {
	providerModelCategory,
	providerModelListSearchParam,
	providerModelStatus,
	providerModelType,
	type ProviderModelCategory,
	type ProviderModelGroup,
	type ProviderModelStatus,
	type ProviderModelType,
} from "@magic-admin-v2/features/platform-model-list/types"
import {
	allCategoriesTab,
	allStatusFilterValue,
	createDefaultFilterDraft,
	type FilterOption,
	getCreateModelDefaults,
	type ModelCategoryTab,
	type ModelListFilterDraft,
	modelTypesByCategory,
	resolveModelCategoryTab,
	restrictQueryParamsToAccess,
	toQueryParams,
} from "@magic-admin-v2/features/platform-model-list/utils/model-list"
import { useTranslation } from "react-i18next"
import type { ApiError } from "@magic-admin-v2/api/types"
import { useRuntime } from "@magic-admin-v2/runtime/context"
import { cn } from "@magic-admin-v2/utils/cn"
import { useListQueryParams } from "@magic-admin-v2/hooks/use-list-query-params"

export default function PlatformModelListPage({
	pageTestId = "model-list-page",
}: {
	pageTestId?: string
}) {
	const { t } = useTranslation()
	const { access } = useRuntime()
	const dataSource = useProviderModelDataSource()
	const categoryAccess = useMemo(
		() => getProviderModelCategoryAccess(access, dataSource.permissionScope),
		[access, dataSource.permissionScope],
	)
	const accessibleCategories = useMemo(
		() => getAccessibleProviderModelCategories(categoryAccess),
		[categoryAccess],
	)
	const editableCategories = useMemo(
		() => getEditableProviderModelCategories(categoryAccess),
		[categoryAccess],
	)
	const [searchParams] = useSearchParams()
	const serviceProviderConfigId =
		searchParams.get(providerModelListSearchParam.serviceProviderConfigId)?.trim() ?? ""
	const [activeCategory, setActiveCategory] = useState<ModelCategoryTab>(allCategoriesTab)
	const resolvedActiveCategory = resolveModelCategoryTab(activeCategory, accessibleCategories)
	const toParams = useCallback(
		(draft: ModelListFilterDraft, nextPage: number, currentPageSize: number) =>
			toQueryParams(
				draft,
				resolvedActiveCategory,
				accessibleCategories,
				nextPage,
				serviceProviderConfigId,
				currentPageSize,
			),
		[accessibleCategories, resolvedActiveCategory, serviceProviderConfigId],
	)
	const {
		filterDraft,
		pageSize: currentPageSize,
		params,
		setDebouncedField,
		setFilterDraft,
		setPage,
		setPageSize,
	} = useListQueryParams({
		debounceFields: ["keyword"],
		extraResetKey: `${resolvedActiveCategory}:${serviceProviderConfigId}`,
		initialDraft: createDefaultFilterDraft,
		toParams,
	})
	const [mobileFilterDraft, setMobileFilterDraft] = useState<ModelListFilterDraft>(() =>
		createDefaultFilterDraft(),
	)
	const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
	const [detailTarget, setDetailTarget] = useState<ProviderModelGroup | null>(null)
	const [editorTarget, setEditorTarget] = useState<ProviderModelGroup | null>(null)
	const [isEditorOpen, setIsEditorOpen] = useState(false)
	const hasViewAccess = accessibleCategories.length > 0
	const permissionSafeParams = useMemo(
		() => restrictQueryParamsToAccess(params, accessibleCategories),
		[accessibleCategories, params],
	)
	const listQuery = useProviderModelGroupsQuery(permissionSafeParams, {
		enabled: hasViewAccess,
	})
	const queryError = listQuery.error as ApiError | null
	const items = listQuery.data?.list ?? []
	const total = listQuery.data?.total ?? 0
	const currentPage = listQuery.data?.page ?? permissionSafeParams.page
	const createModelDefaults = getCreateModelDefaults(resolvedActiveCategory, editableCategories)
	const canCreateModel =
		resolvedActiveCategory === allCategoriesTab
			? editableCategories.length > 0
			: categoryAccess[resolvedActiveCategory].canEdit
	const accessibleModelTypes = useMemo(
		() => accessibleCategories.flatMap((category) => modelTypesByCategory[category]),
		[accessibleCategories],
	)

	const allModelTypeOptions = useMemo<Array<FilterOption<ProviderModelType>>>(
		() => [
			{ value: providerModelType.textToImage, label: t("modelList.type.textToImage") },
			{ value: providerModelType.imageToImage, label: t("modelList.type.imageToImage") },
			{
				value: providerModelType.imageEnhancement,
				label: t("modelList.type.imageEnhancement"),
			},
			{
				value: providerModelType.largeLanguageModel,
				label: t("modelList.type.largeLanguageModel"),
			},
			{ value: providerModelType.embedding, label: t("modelList.type.embedding") },
			{ value: providerModelType.textToVideo, label: t("modelList.type.textToVideo") },
		],
		[t],
	)
	const modelTypeOptions = useMemo(
		() =>
			resolvedActiveCategory === allCategoriesTab
				? allModelTypeOptions.filter((option) =>
						accessibleModelTypes.includes(option.value),
					)
				: allModelTypeOptions.filter((option) =>
						modelTypesByCategory[resolvedActiveCategory].includes(option.value),
					),
		[accessibleModelTypes, allModelTypeOptions, resolvedActiveCategory],
	)
	const shouldShowModelTypeFilter = useMemo(
		() =>
			resolvedActiveCategory !== providerModelCategory.llm &&
			resolvedActiveCategory !== providerModelCategory.embedding &&
			resolvedActiveCategory !== providerModelCategory.vgm,
		[resolvedActiveCategory],
	)

	const statusOptions = useMemo<Array<FilterOption<ProviderModelStatus>>>(
		() => [
			{ value: providerModelStatus.enabled, label: t("modelList.status.enabled") },
			{ value: providerModelStatus.disabled, label: t("modelList.status.disabled") },
		],
		[t],
	)

	const columns = useMemo<Array<ColumnDef<ProviderModelGroup>>>(
		() => [
			{
				id: "model",
				enableSorting: false,
				size: 360,
				header: t("modelList.column.model"),
				cell: ({ row }) => <ModelCell item={row.original} />,
			},
			{
				accessorKey: "category",
				enableSorting: false,
				size: 140,
				header: t("modelList.column.category"),
				cell: ({ row }) => <CategoryBadge value={row.original.category} />,
			},
			{
				accessorKey: "model_type",
				enableSorting: false,
				size: 150,
				header: t("modelList.column.modelType"),
				cell: ({ row }) => <ModelTypeBadge value={row.original.model_type} />,
			},
			{
				accessorKey: "provider_count",
				enableSorting: false,
				size: 180,
				header: t("modelList.column.providers"),
				cell: ({ row }) => (
					<Badge variant="secondary">
						{t("modelList.providerCount", { count: row.original.provider_count })}
					</Badge>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				size: 196,
				meta: { fitContent: true },
				header: t("modelList.column.actions"),
				cell: ({ row }) => {
					const rowCanEdit =
						categoryAccess[getProviderModelAccessCategory(row.original)].canEdit

					return (
						<div className="flex justify-end">
							<div className="flex items-center gap-2">
								<Button
									className="whitespace-nowrap md:w-auto md:gap-1.5 md:px-2.5"
									data-testid="model-list-view-button"
									onClick={() => setDetailTarget(row.original)}
									size="icon-sm"
									variant="outline"
								>
									<Eye className="size-4" aria-hidden="true" />
									<span className="hidden md:inline">
										{t("modelList.action.viewDetails")}
									</span>
								</Button>
								{rowCanEdit ? (
									<Button
										className="whitespace-nowrap md:w-auto md:gap-1.5 md:px-2.5"
										data-testid="model-list-edit-button"
										onClick={() => {
											setEditorTarget(row.original)
											setIsEditorOpen(true)
										}}
										size="icon-sm"
										variant="outline"
									>
										<Pencil className="size-4" aria-hidden="true" />
										<span className="hidden md:inline">
											{t("modelList.action.edit")}
										</span>
									</Button>
								) : null}
							</div>
						</div>
					)
				},
			},
		],
		[categoryAccess, t],
	)

	useEffect(() => {
		if (activeCategory !== resolvedActiveCategory) {
			setActiveCategory(resolvedActiveCategory)
		}
	}, [activeCategory, resolvedActiveCategory])

	useEffect(() => {
		setFilterDraft((previous) => {
			const modelTypes = previous.modelTypes.filter((modelType) =>
				accessibleModelTypes.includes(modelType),
			)
			return modelTypes.length === previous.modelTypes.length
				? previous
				: { ...previous, modelTypes }
		})
	}, [accessibleModelTypes, setFilterDraft])

	useEffect(() => {
		if (!isEditorOpen) {
			return
		}

		const canContinueEditing = editorTarget
			? categoryAccess[getProviderModelAccessCategory(editorTarget)].canEdit
			: editableCategories.length > 0
		if (!canContinueEditing) {
			setIsEditorOpen(false)
			setEditorTarget(null)
		}
	}, [categoryAccess, editableCategories.length, editorTarget, isEditorOpen])

	function handleMobileFilterOpenChange(open: boolean) {
		if (open) {
			setMobileFilterDraft({
				...filterDraft,
				modelTypes: [...filterDraft.modelTypes],
			})
		}
		setMobileFilterOpen(open)
	}

	function resetMobileFilters() {
		setMobileFilterDraft(createDefaultFilterDraft())
	}

	function applyMobileFilters() {
		setFilterDraft((previous) => ({
			...previous,
			keyword: mobileFilterDraft.keyword,
			modelTypes: [...mobileFilterDraft.modelTypes],
			status: mobileFilterDraft.status,
		}))
		setMobileFilterOpen(false)
	}

	function handleCategoryChange(nextCategory: ModelCategoryTab) {
		if (nextCategory !== allCategoriesTab && !accessibleCategories.includes(nextCategory)) {
			return
		}

		setActiveCategory(nextCategory)
		setFilterDraft((previous) => {
			if (nextCategory === allCategoriesTab) {
				return previous
			}

			const allowedModelTypes = modelTypesByCategory[nextCategory]
			const modelTypes = previous.modelTypes.filter((modelType) =>
				allowedModelTypes.includes(modelType),
			)
			return modelTypes.length === previous.modelTypes.length
				? previous
				: { ...previous, modelTypes }
		})
	}

	return (
		<>
			<ListShell
				actions={
					<div className="flex items-center gap-2">
						<PageHeaderActionButton
							data-testid="model-list-refresh-button"
							disabled={!hasViewAccess || listQuery.isFetching}
							onClick={() => listQuery.refetch()}
							variant="outline"
						>
							<RefreshCw
								className={cn("size-4", listQuery.isFetching && "animate-spin")}
								aria-hidden="true"
							/>
							{t("common.refresh")}
						</PageHeaderActionButton>
						{canCreateModel ? (
							<PageHeaderActionButton
								data-testid="model-list-create-button"
								onClick={() => {
									setEditorTarget(null)
									setIsEditorOpen(true)
								}}
							>
								<Plus className="size-4" aria-hidden="true" />
								{t("modelList.action.create")}
							</PageHeaderActionButton>
						) : null}
					</div>
				}
				description={t("nav.desc.modelList")}
				testId={pageTestId}
				title={t("nav.item.modelList")}
			>
				{/* Keep the sticky filters in the same container as the list they overlay; otherwise the short filter wrapper bounds their sticky range. */}
				<div className="flex flex-col gap-4">
					<ModelCategoryTabs
						activeCategory={resolvedActiveCategory}
						categories={accessibleCategories}
						onChange={handleCategoryChange}
					/>
					<div
						className="sticky top-0 z-40 -mx-4 flex min-w-0 items-end gap-2 bg-background px-4 py-2 md:hidden lg:-mx-6 lg:px-6"
						data-testid="model-list-mobile-filters"
					>
						<FilterControlField
							className="min-w-0 flex-1"
							label={t("modelList.filter.search")}
						>
							<FilterSearchInput
								aria-label={t("modelList.placeholder.search")}
								clearLabel={t("common.clear")}
								containerClassName="min-w-0"
								clearButtonTestId="model-list-search-clear-button"
								inputTestId="model-list-search-input"
								onValueChange={(keyword) => setDebouncedField("keyword", keyword)}
								placeholder={t("modelList.placeholder.search")}
								value={filterDraft.keyword}
							/>
						</FilterControlField>
						<Button
							aria-label={t("modelList.filter.title")}
							data-testid="model-list-advanced-trigger"
							onClick={() => handleMobileFilterOpenChange(true)}
							size="icon"
							variant="outline"
						>
							<Filter className="size-4" aria-hidden="true" />
						</Button>
					</div>
					<div
						className="sticky top-0 z-40 -mx-4 hidden flex-wrap items-end gap-2 bg-background px-4 py-2 md:flex lg:-mx-6 lg:px-6"
						data-testid="model-list-filters"
					>
						<FilterControlField
							className="w-full min-w-0 md:w-[340px] xl:w-[420px]"
							label={t("modelList.filter.search")}
						>
							<FilterSearchInput
								aria-label={t("modelList.placeholder.search")}
								clearLabel={t("common.clear")}
								containerClassName="min-w-0"
								clearButtonTestId="model-list-search-clear-button"
								inputTestId="model-list-search-input"
								onValueChange={(keyword) => setDebouncedField("keyword", keyword)}
								placeholder={t("modelList.placeholder.search")}
								value={filterDraft.keyword}
							/>
						</FilterControlField>
						<FilterControlField
							className="w-fit"
							label={t("modelList.filter.statuses")}
						>
							<Select
								onValueChange={(value) =>
									setFilterDraft((previous) => ({
										...previous,
										status:
											value === allStatusFilterValue
												? null
												: (Number(value) as ProviderModelStatus),
									}))
								}
								value={
									filterDraft.status === null
										? allStatusFilterValue
										: String(filterDraft.status)
								}
							>
								<SelectTrigger
									aria-label={t("modelList.filter.statuses")}
									className="w-32"
									data-testid="model-list-status-trigger"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent data-testid="platform-model-list-model-list-status-content">
									<SelectItem
										value={allStatusFilterValue}
										data-testid="platform-model-list-option"
									>
										{t("modelList.filter.allStatuses")}
									</SelectItem>
									{statusOptions.map((option) => (
										<SelectItem
											key={option.value}
											value={String(option.value)}
											data-testid="platform-model-list-option"
										>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FilterControlField>
						{shouldShowModelTypeFilter ? (
							<FilterControlField
								className="w-fit"
								label={t("modelList.filter.modelTypes")}
							>
								<MultiSelectFilter
									clearButtonTestId="model-list-model-type-clear-button"
									contentTestId="model-list-model-type-content"
									optionTestId="model-list-model-type-option"
									triggerTestId="model-list-model-type-trigger"
									allLabel={t("modelList.filter.allModelTypes")}
									ariaLabel={t("modelList.filter.modelTypes")}
									options={modelTypeOptions}
									value={filterDraft.modelTypes}
									onChange={(modelTypes) =>
										setFilterDraft((previous) => ({ ...previous, modelTypes }))
									}
								/>
							</FilterControlField>
						) : null}
					</div>
					<FilterSheet
						applyLabel={t("modelList.action.applyFilters")}
						applyButtonTestId="model-list-advanced-apply-button"
						bodyTestId="model-list-advanced-body"
						closeButtonTestId="model-list-advanced-close-button"
						contentTestId="model-list-advanced-content"
						onApply={applyMobileFilters}
						onOpenChange={handleMobileFilterOpenChange}
						onReset={resetMobileFilters}
						open={mobileFilterOpen}
						presentation="mobile-only"
						resetButtonTestId="model-list-advanced-reset-button"
						resetLabel={t("modelList.action.reset")}
						title={t("modelList.filter.title")}
					>
						<FilterControlField className="w-full" label={t("modelList.filter.search")}>
							<FilterSearchInput
								aria-label={t("modelList.placeholder.search")}
								clearLabel={t("common.clear")}
								containerClassName="min-w-0"
								clearButtonTestId="model-list-advanced-search-clear-button"
								inputTestId="model-list-advanced-search-input"
								onValueChange={(keyword) =>
									setMobileFilterDraft((previous) => ({ ...previous, keyword }))
								}
								placeholder={t("modelList.placeholder.search")}
								value={mobileFilterDraft.keyword}
							/>
						</FilterControlField>
						<FilterControlField
							className="w-full"
							label={t("modelList.filter.statuses")}
						>
							<Select
								onValueChange={(value) =>
									setMobileFilterDraft((previous) => ({
										...previous,
										status:
											value === allStatusFilterValue
												? null
												: (Number(value) as ProviderModelStatus),
									}))
								}
								value={
									mobileFilterDraft.status === null
										? allStatusFilterValue
										: String(mobileFilterDraft.status)
								}
							>
								<SelectTrigger
									className="w-full"
									data-testid="model-list-advanced-status-trigger"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent data-testid="platform-model-list-model-list-advanced-status-content">
									<SelectItem
										value={allStatusFilterValue}
										data-testid="platform-model-list-option"
									>
										{t("modelList.filter.allStatuses")}
									</SelectItem>
									{statusOptions.map((option) => (
										<SelectItem
											key={option.value}
											value={String(option.value)}
											data-testid="platform-model-list-option"
										>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FilterControlField>
						{shouldShowModelTypeFilter ? (
							<FilterControlField
								className="w-full"
								label={t("modelList.filter.modelTypes")}
							>
								<MultiSelectFilter
									clearButtonTestId="model-list-advanced-model-type-clear-button"
									contentTestId="model-list-advanced-model-type-content"
									optionTestId="model-list-advanced-model-type-option"
									triggerTestId="model-list-advanced-model-type-trigger"
									allLabel={t("modelList.filter.allModelTypes")}
									ariaLabel={t("modelList.filter.modelTypes")}
									options={modelTypeOptions}
									value={mobileFilterDraft.modelTypes}
									onChange={(modelTypes) =>
										setMobileFilterDraft((previous) => ({
											...previous,
											modelTypes,
										}))
									}
								/>
							</FilterControlField>
						) : null}
					</FilterSheet>

					{queryError && !listQuery.data ? (
						<div className="rounded-lg border border-border/50 p-4">
							<EmptyState
								icon={AlertCircle}
								testId="model-list-error"
								title={t("modelList.error.loadTitle")}
								description={queryError.message}
							/>
						</div>
					) : (
						<>
							<DataTable
								columns={columns}
								containerTestId="model-list-table"
								data={items}
								emptyState={
									<EmptyState
										icon={BrainCircuit}
										testId="model-list-empty"
										title={t("modelList.empty.title")}
										description={t("modelList.empty.description")}
									/>
								}
								getRowId={(item) => item.model_id}
								isLoading={listQuery.isLoading}
								loadingTestId="model-list-loading"
								minWidth={940}
								rowTestId="model-list-row"
								stickyRightColumnId="actions"
							/>

							<ListPagination
								pageSizeOptionTestId="model-list-page-size-option"
								showQuickJumper
								className="mt-4 px-1"
								loading={listQuery.isFetching}
								jumpInputTestId="model-list-jump-input"
								nextButtonTestId="model-list-next-button"
								onPageChange={setPage}
								page={currentPage}
								pageSize={currentPageSize}
								onPageSizeChange={setPageSize}
								pageSizeTriggerTestId="model-list-page-size-trigger"
								previousButtonTestId="model-list-previous-button"
								testId="model-list-pagination"
								total={total}
							/>
						</>
					)}
				</div>
			</ListShell>

			<ModelDetailDialog
				item={detailTarget}
				onOpenChange={(open) => !open && setDetailTarget(null)}
			/>
			<ModelEditorDialog
				allowedCategories={editableCategories}
				initialCategory={createModelDefaults.category}
				initialModelType={createModelDefaults.modelType}
				model={editorTarget}
				open={isEditorOpen}
				onOpenChange={(open) => {
					setIsEditorOpen(open)
					if (!open) {
						setEditorTarget(null)
					}
				}}
			/>
		</>
	)
}

function ModelCategoryTabs({
	activeCategory,
	categories,
	onChange,
}: {
	activeCategory: ModelCategoryTab
	categories: readonly ProviderModelCategory[]
	onChange: (category: ModelCategoryTab) => void
}) {
	const { t } = useTranslation()

	return (
		<Tabs
			data-testid="model-list-category-tabs"
			value={activeCategory}
			onValueChange={(value) => onChange(value as ModelCategoryTab)}
		>
			<div className="overflow-x-auto">
				<TabsList className="min-w-max">
					<TabsTrigger data-testid="model-list-category-trigger" value={allCategoriesTab}>
						{t("modelList.tab.all")}
					</TabsTrigger>
					{categories.map((category) => (
						<TabsTrigger
							data-testid="model-list-category-trigger"
							key={category}
							value={category}
						>
							{t(`modelList.category.${category}`)}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
		</Tabs>
	)
}

function ModelCell({ item }: { item: ProviderModelGroup }) {
	const { t } = useTranslation()
	const displayName = item.name.trim() || t("modelList.editor.modelPreview")

	return (
		<div className="flex min-w-0 items-center gap-3">
			<EntityAvatarRender
				alt=""
				className="size-9"
				fallbackIcon={<DefaultModelIcon />}
				imageClassName="object-cover"
				name={displayName}
				src={item.icon}
			/>
			<div className="min-w-0 flex flex-col gap-1">
				<CopyableValue
					className="font-sans text-sm font-medium text-foreground"
					value={displayName}
				/>
				<CopyableValue className="max-w-full" value={item.model_id} label="ModelID" />
			</div>
		</div>
	)
}
