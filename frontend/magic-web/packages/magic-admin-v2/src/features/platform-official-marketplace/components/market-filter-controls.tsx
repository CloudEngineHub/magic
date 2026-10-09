import type { ReactNode } from "react"
import { Filter } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { FieldSearchControl } from "@magic-admin-v2/components/field-search-control"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { SearchableMultiSelect } from "@magic-admin-v2/components/searchable-multi-select"
import { TimeFilterPanel } from "@magic-admin-v2/components/time-filter-panel"
import { Button } from "@magic-admin-v2/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import {
	marketPublishStatus,
	marketPublisherType,
	marketSelectAllValue,
	type MarketCategoryOption,
	type MarketDraftUpdater,
	type MarketFilterDraft,
	type MarketKind,
	type MarketOrderBy,
} from "@magic-admin-v2/features/platform-official-marketplace/types"
import {
	createDefaultFilterDraft,
	getMarketSearchFieldOptions,
	getMarketSearchFieldPlaceholder,
	getPublisherTypeLabel,
	getPublishStatusLabel,
} from "@magic-admin-v2/features/platform-official-marketplace/utils"
import { cn } from "@magic-admin-v2/utils/cn"
import {
	createLinkedAdvancedFilterDraft,
	createLinkedAppliedFilterDraft,
} from "@magic-admin-v2/utils/linked-search-filter-state"

type MarketFiltersProps = {
	categoryOptions?: MarketCategoryOption[]
	categoryOptionsLoading?: boolean
	codeLabel: string
	codePlaceholder: string
	filterDraft: MarketFilterDraft
	kind: MarketKind
	onDraftChange: (value: MarketDraftUpdater) => void
	showCategoryFilter?: boolean
	showPackageName: boolean
	toolbarActions?: ReactNode
}

/** Shared inline and advanced filters for both marketplace tabs. */
export function MarketFilters({
	categoryOptions = [],
	categoryOptionsLoading = false,
	codeLabel,
	codePlaceholder,
	filterDraft,
	kind,
	onDraftChange,
	showCategoryFilter = false,
	showPackageName,
	toolbarActions,
}: MarketFiltersProps) {
	const { t } = useTranslation()
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
	const [advancedFilterDraft, setAdvancedFilterDraft] = useState(filterDraft)

	function handleFilterSheetOpenChange(open: boolean) {
		if (open) {
			// Mirror the active quick-search field into its advanced-filter counterpart.
			setAdvancedFilterDraft(
				createLinkedAdvancedFilterDraft(
					filterDraft,
					filterDraft.search_field,
					filterDraft.search_value,
				),
			)
		}
		setIsFilterSheetOpen(open)
	}

	function resetAdvancedFilters() {
		setAdvancedFilterDraft((previous) => ({
			...createDefaultFilterDraft(),
			search_field: previous.search_field,
		}))
	}

	function applyAdvancedFilters() {
		const nextDraft = {
			...advancedFilterDraft,
			category_ids: showCategoryFilter ? advancedFilterDraft.category_ids : [],
			package_name: showPackageName ? advancedFilterDraft.package_name : "",
		}

		// Rebuild the quick-search value from the selected advanced field before querying.
		onDraftChange(
			createLinkedAppliedFilterDraft(nextDraft, nextDraft.search_field, "search_value"),
		)
		setIsFilterSheetOpen(false)
	}

	return (
		<>
			<div className="flex min-w-0 flex-wrap items-end gap-2">
				<FilterControlField
					className="min-w-0 flex-1 md:w-[340px] md:flex-none xl:w-[420px]"
					label={t("officialMarketplace.filter.searchCondition")}
				>
					<FieldSearchControl
						selectTriggerTestId="platform-official-marketplace-search-field-trigger"
							testId="platform-official-marketplace-search-field"
						contentTestId="platform-official-marketplace-search-field-content"
						optionTestId="platform-official-marketplace-search-field-option"
						ariaLabel={t("officialMarketplace.filter.searchField")}
						clearLabel={t("common.clear")}
						inputValue={filterDraft.search_value}
						onInputChange={(value) =>
							onDraftChange((previous) => ({ ...previous, search_value: value }))
						}
						onValueChange={(value) =>
							onDraftChange((previous) => ({ ...previous, search_field: value }))
						}
						options={getMarketSearchFieldOptions(kind, t)}
						placeholder={getMarketSearchFieldPlaceholder(
							filterDraft.search_field,
							kind,
							t,
						)}
						value={filterDraft.search_field}
					 inputTestId="platform-official-marketplace-advanced-search-input" clearButtonTestId="platform-official-marketplace-advanced-search-clear-button"/>
				</FilterControlField>

				<div className="hidden items-end md:flex">
					<MarketFilterSelects
						filterDraft={filterDraft}
						onDraftChange={onDraftChange}
						visibleFields={["publish_status"]}
					/>
				</div>
				<div className="hidden items-end md:flex">
					<MarketFilterSelects
						filterDraft={filterDraft}
						onDraftChange={onDraftChange}
						visibleFields={["publisher_type"]}
					/>
				</div>

				<div className="shrink-0">
					<Button
						aria-label={t("officialMarketplace.filter.title")}
						className="h-9 w-9 px-0 md:w-auto md:px-3"
						onClick={() => handleFilterSheetOpenChange(true)}
						type="button"
						variant="outline"
					 data-testid="platform-official-marketplace-reset-button">
						<Filter className="size-4" aria-hidden="true" />
						<span className="hidden md:inline">
							{t("officialMarketplace.filter.title")}
						</span>
					</Button>
				</div>

				{toolbarActions ? (
					<div className="shrink-0 md:ml-auto">{toolbarActions}</div>
				) : null}
			</div>

			<FilterSheet contentTestId="platform-official-marketplace-filter-sheet" bodyTestId="platform-official-marketplace-filter-body" resetButtonTestId="platform-official-marketplace-reset-button" applyButtonTestId="platform-official-marketplace-apply-button"
				closeButtonTestId="platform-official-marketplace-filter-close-button"
				applyLabel={t("officialMarketplace.filter.apply")}
				bodyClassName="overflow-x-hidden"
				onApply={applyAdvancedFilters}
				onOpenChange={handleFilterSheetOpenChange}
				onReset={resetAdvancedFilters}
				open={isFilterSheetOpen}
				presentation="responsive"
				resetLabel={t("officialMarketplace.action.reset")}
				title={t("officialMarketplace.filter.title")}
				description={t("officialMarketplace.filter.description")}
			>
				<MarketAdvancedFilterControls
					categoryOptions={categoryOptions}
					categoryOptionsLoading={categoryOptionsLoading}
					codeLabel={codeLabel}
					codePlaceholder={codePlaceholder}
					filterDraft={advancedFilterDraft}
					onDraftChange={setAdvancedFilterDraft}
					showCategoryFilter={showCategoryFilter}
					showPackageName={showPackageName}
				/>
			</FilterSheet>
		</>
	)
}

function SearchInput({
	className,
	label,
	onChange,
	placeholder,
	value,
}: {
	className?: string
	label: string
	onChange: (value: string) => void
	placeholder: string
	value: string
}) {
	const { t } = useTranslation()

	return (
		<FilterControlField
			className={cn("min-w-0 flex-1 md:flex-none md:w-[340px] xl:w-[420px]", className)}
			label={label}
		>
			<FilterSearchInput
				aria-label={label}
				clearLabel={t("common.clear")}
				containerClassName="min-w-0"
				onValueChange={onChange}
				placeholder={placeholder}
				value={value}
			 inputTestId="platform-official-marketplace-advanced-search-input" clearButtonTestId="platform-official-marketplace-advanced-search-clear-button"/>
		</FilterControlField>
	)
}

function MarketAdvancedFilterControls({
	categoryOptions,
	categoryOptionsLoading,
	codeLabel,
	codePlaceholder,
	filterDraft,
	onDraftChange,
	showCategoryFilter,
	showPackageName,
}: {
	categoryOptions: MarketCategoryOption[]
	categoryOptionsLoading: boolean
	codeLabel: string
	codePlaceholder: string
	filterDraft: MarketFilterDraft
	onDraftChange: (value: MarketDraftUpdater) => void
	showCategoryFilter: boolean
	showPackageName: boolean
}) {
	const { t } = useTranslation()

	return (
		<>
			<SearchInput
				className="w-full md:w-full xl:w-full"
				label={codeLabel}
				placeholder={codePlaceholder}
				value={filterDraft.code}
				onChange={(value) => onDraftChange((previous) => ({ ...previous, code: value }))}
			/>
			<SearchInput
				className="w-full md:w-full xl:w-full"
				label={t("officialMarketplace.filter.name")}
				placeholder={t("officialMarketplace.placeholder.name")}
				value={filterDraft.name_i18n}
				onChange={(value) =>
					onDraftChange((previous) => ({ ...previous, name_i18n: value }))
				}
			/>
			{showPackageName ? (
				<SearchInput
					className="w-full md:w-full xl:w-full"
					label={t("officialMarketplace.filter.packageName")}
					placeholder={t("officialMarketplace.placeholder.packageName")}
					value={filterDraft.package_name}
					onChange={(value) =>
						onDraftChange((previous) => ({ ...previous, package_name: value }))
					}
				/>
			) : null}
			<SearchInput
				className="w-full md:w-full xl:w-full"
				label={t("officialMarketplace.filter.organizationCode")}
				placeholder={t("officialMarketplace.placeholder.organizationCode")}
				value={filterDraft.organization_code}
				onChange={(value) =>
					onDraftChange((previous) => ({ ...previous, organization_code: value }))
				}
			/>
			{showCategoryFilter ? (
				<FilterControlField
					className="w-full"
					label={t("officialMarketplace.filter.category")}
				>
					<SearchableMultiSelect
						ariaLabel={t("officialMarketplace.filter.category")}
						clearLabel={t("officialMarketplace.filter.clearCategories")}
						emptyLabel={t("officialMarketplace.filter.allCategories")}
						isLoading={categoryOptionsLoading}
						noMatchingLabel={t("officialMarketplace.filter.noMatchingCategories")}
						onChange={(categoryIds) =>
							onDraftChange((previous) => ({
								...previous,
								category_ids: categoryIds,
							}))
						}
						options={categoryOptions}
						searchPlaceholder={t("officialMarketplace.filter.searchCategories")}
						selectedCountLabel={(count) =>
							t("officialMarketplace.filter.selectedCategoryCount", { count })
						}
						value={filterDraft.category_ids}
					 triggerTestId="platform-official-marketplace-multi-select-trigger" contentTestId="platform-official-marketplace-multi-select-content" searchInputTestId="platform-official-marketplace-multi-select-search-input" searchClearButtonTestId="platform-official-marketplace-multi-select-search-clear-button" optionTestId="platform-official-marketplace-multi-select-option" loadingTestId="platform-official-marketplace-multi-select-loading" emptyTestId="platform-official-marketplace-multi-select-empty" clearButtonTestId="platform-official-marketplace-multi-select-clear-button"/>
				</FilterControlField>
			) : null}
			<MarketFilterSelects
				filterDraft={filterDraft}
				onDraftChange={onDraftChange}
				variant="sheet"
				visibleFields={["publish_status", "publisher_type", "order_by"]}
			/>
			<FilterControlField
				className="w-full"
				label={t("officialMarketplace.filter.createdAt")}
			>
				<TimeFilterPanel
					className="w-full"
					testIdPrefix="platform-official-marketplace-time-filter"
					onChange={(timeRange) =>

						onDraftChange((previous) => ({
							...previous,
							end_time: timeRange?.endDate ?? "",
							start_time: timeRange?.startDate ?? "",
							time_range: timeRange,
						}))
					}
					presentation="inline"
					value={filterDraft.time_range}
				/>
			</FilterControlField>
		</>
	)
}

type MarketSelectField = "publish_status" | "publisher_type" | "order_by"

function MarketFilterSelects({
	filterDraft,
	onDraftChange,
	variant = "inline",
	visibleFields = ["publish_status", "publisher_type", "order_by"],
}: {
	filterDraft: MarketFilterDraft
	onDraftChange: (value: MarketDraftUpdater) => void
	variant?: "inline" | "sheet"
	visibleFields?: MarketSelectField[]
}) {
	const { t } = useTranslation()
	const fieldClassName = variant === "sheet" ? "w-full" : "w-fit"
	const triggerClassName = variant === "sheet" ? "w-full" : "w-fit max-w-full"

	return (
		<>
			{visibleFields.includes("publish_status") ? (
				<FilterControlField
					className={fieldClassName}
					label={t("officialMarketplace.filter.publishStatus")}
				>
					<Select
						value={filterDraft.publish_status}
						onValueChange={(value) =>
							onDraftChange((previous) => ({ ...previous, publish_status: value }))
						}
					>
						<SelectTrigger className={triggerClassName} data-testid="platform-official-marketplace-select-trigger">
							<SelectValue />
						</SelectTrigger>
						<SelectContent data-testid="platform-official-marketplace-select-content">
							<SelectItem value={marketSelectAllValue} data-testid="platform-official-marketplace-option">
								{t("officialMarketplace.filter.all")}
							</SelectItem>
							{Object.values(marketPublishStatus).map((value) => (
								<SelectItem key={value} value={value} data-testid="platform-official-marketplace-option">
									{getPublishStatusLabel(value, t)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FilterControlField>
			) : null}
			{visibleFields.includes("publisher_type") ? (
				<FilterControlField
					className={fieldClassName}
					label={t("officialMarketplace.filter.publisherType")}
				>
					<Select
						value={filterDraft.publisher_type}
						onValueChange={(value) =>
							onDraftChange((previous) => ({ ...previous, publisher_type: value }))
						}
					>
						<SelectTrigger className={triggerClassName} data-testid="platform-official-marketplace-select-trigger">
							<SelectValue />
						</SelectTrigger>
						<SelectContent data-testid="platform-official-marketplace-select-content">
							<SelectItem value={marketSelectAllValue} data-testid="platform-official-marketplace-option">
								{t("officialMarketplace.filter.all")}
							</SelectItem>
							{Object.values(marketPublisherType).map((value) => (
								<SelectItem key={value} value={value} data-testid="platform-official-marketplace-option">
									{getPublisherTypeLabel(value, t)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FilterControlField>
			) : null}
			{visibleFields.includes("order_by") ? (
				<FilterControlField
					className={fieldClassName}
					label={t("officialMarketplace.filter.orderBy")}
				>
					<Select
						value={filterDraft.order_by}
						onValueChange={(value) =>
							onDraftChange((previous) => ({
								...previous,
								order_by: value as MarketOrderBy,
							}))
						}
					>
						<SelectTrigger className={triggerClassName} data-testid="platform-official-marketplace-select-trigger">
							<SelectValue />
						</SelectTrigger>
						<SelectContent data-testid="platform-official-marketplace-select-content">
							<SelectItem value="desc" data-testid="platform-official-marketplace-option">
								{t("officialMarketplace.order.desc")}
							</SelectItem>
							<SelectItem value="asc" data-testid="platform-official-marketplace-option">
								{t("officialMarketplace.order.asc")}
							</SelectItem>
						</SelectContent>
					</Select>
				</FilterControlField>
			) : null}
		</>
	)
}
