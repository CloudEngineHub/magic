import type { ColumnDef } from "@tanstack/react-table"
import { AlertCircle, Filter } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { Button } from "@magic-admin-v2/components/ui/button"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FieldSearchControl } from "@magic-admin-v2/components/field-search-control"
import {
	createLinkedAdvancedFilterDraft,
	createLinkedAppliedFilterDraft,
} from "@magic-admin-v2/utils/linked-search-filter-state"
import {
	publishReviewSelectAllValue,
	type PublishReviewFilterDraft,
	type PublishReviewKind,
	type PublishReviewSearchField,
	type PublishReviewVariant,
} from "@magic-admin-v2/features/platform-publish-review/types"
import {
	createDefaultFilterDraft,
	getSearchFieldOptions,
	getSearchFieldPlaceholder,
	type ReviewDraftUpdater,
} from "@magic-admin-v2/features/platform-publish-review/params"
import {
	AdvancedFilterControls,
	PublishStatusSelect,
	ReviewStatusSelect,
} from "@magic-admin-v2/features/platform-publish-review/components/review-filters"
import type { ApiError } from "@magic-admin-v2/api/types"

export function ReviewListPanel<TData>({
	columns,
	data,
	emptyDescription,
	emptyIcon,
	emptyTitle,
	filterDraft,
	isFetching,
	kind,
	minWidth,
	onDraftChange,
	onPageChange,
	onPageSizeChange,
	onSearchValueChange,
	page,
	pageSize,
	queryError,
	total,
	variant,
}: {
	columns: Array<ColumnDef<TData>>
	data: TData[]
	emptyDescription: string
	emptyIcon: typeof AlertCircle
	emptyTitle: string
	filterDraft: PublishReviewFilterDraft
	isFetching: boolean
	kind: PublishReviewKind
	minWidth: number
	onDraftChange: (value: ReviewDraftUpdater) => void
	onPageChange: (page: number) => void
	onPageSizeChange: (pageSize: number) => void
	onSearchValueChange: (value: string) => void
	page: number
	pageSize: number
	queryError: ApiError | null
	total: number
	variant: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
	const [advancedDraft, setAdvancedDraft] = useState(filterDraft)

	function handleFilterSheetOpenChange(open: boolean) {
		if (open) {
			setAdvancedDraft(
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
		setAdvancedDraft((previous) => ({
			...createDefaultFilterDraft(kind, variant),
			search_field: previous.search_field,
		}))
	}

	function applyAdvancedFilters() {
		const nextDraft = {
			...advancedDraft,
			name_i18n: kind === "employee" ? advancedDraft.name_i18n : "",
			organization_code: kind === "employee" ? advancedDraft.organization_code : "",
			package_name: kind === "skill" ? advancedDraft.package_name : "",
			source_type: kind === "skill" ? advancedDraft.source_type : publishReviewSelectAllValue,
			skill_name: kind === "skill" ? advancedDraft.skill_name : "",
		}

		onDraftChange(
			createLinkedAppliedFilterDraft(nextDraft, nextDraft.search_field, "search_value"),
		)
		setIsFilterSheetOpen(false)
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="sticky top-0 z-40 -mx-4 flex min-w-0 flex-wrap items-end gap-2 bg-background px-4 py-2 lg:-mx-6 lg:px-6">
				<FilterControlField
					className="min-w-0 flex-1 md:w-[340px] md:flex-none xl:w-[420px]"
					label={t("publishReview.filter.searchCondition")}
				>
					<FieldSearchControl
						selectTriggerTestId="platform-publish-review-search-field-trigger"
						testId="platform-publish-review-search-field"
						contentTestId="platform-publish-review-search-field-content"
						optionTestId="platform-publish-review-search-field-option"
						ariaLabel={t("publishReview.filter.searchField")}
						clearLabel={t("common.clear")}
						inputValue={filterDraft.search_value}
						onInputChange={onSearchValueChange}
						onValueChange={(value) =>
							onDraftChange((previous) => ({
								...previous,
								search_field: value as PublishReviewSearchField,
							}))
						}
						options={getSearchFieldOptions(kind, t, variant)}
						placeholder={getSearchFieldPlaceholder(filterDraft.search_field, kind, t)}
						value={filterDraft.search_field}
						inputTestId="platform-publish-review-advanced-search-input"
						clearButtonTestId="platform-publish-review-advanced-search-clear-button"
					/>
				</FilterControlField>
				<div className="hidden items-end gap-2 md:flex">
					<ReviewStatusSelect
						className="w-fit"
						label={t("publishReview.filter.reviewStatus")}
						onChange={(value) =>
							onDraftChange((previous) => ({ ...previous, review_status: value }))
						}
						value={filterDraft.review_status}
						variant={variant}
					/>

					<PublishStatusSelect
						className="w-fit"
						label={t("publishReview.filter.publishStatus")}
						onChange={(value) =>
							onDraftChange((previous) => ({ ...previous, publish_status: value }))
						}
						value={filterDraft.publish_status}
						variant={variant}
					/>
				</div>
				<Button
					aria-label={t("publishReview.filter.title")}
					className="h-9 w-9 px-0 md:w-auto md:px-3"
					onClick={() => handleFilterSheetOpenChange(true)}
					type="button"
					variant="outline"
					data-testid="platform-publish-review-reset-button"
				>
					<Filter className="size-4" aria-hidden="true" />
					<span className="hidden md:inline">{t("publishReview.filter.title")}</span>
				</Button>
			</div>

			<FilterSheet
				contentTestId="platform-publish-review-filter-sheet"
				bodyTestId="platform-publish-review-filter-body"
				resetButtonTestId="platform-publish-review-reset-button"
				applyButtonTestId="platform-publish-review-apply-button"
				closeButtonTestId="platform-publish-review-filter-close-button"
				applyLabel={t("publishReview.filter.apply")}
				onApply={applyAdvancedFilters}
				onOpenChange={handleFilterSheetOpenChange}
				onReset={resetAdvancedFilters}
				open={isFilterSheetOpen}
				presentation="responsive"
				resetLabel={t("publishReview.action.reset")}
				title={t("publishReview.filter.title")}
				description={t("publishReview.filter.description")}
			>
				<AdvancedFilterControls
					filterDraft={advancedDraft}
					kind={kind}
					onDraftChange={setAdvancedDraft}
					variant={variant}
				/>
			</FilterSheet>

			{queryError ? (
				<div className="rounded-lg border border-border/50 p-4">
					<EmptyState
						icon={AlertCircle}
						title={t("publishReview.error.loadTitle")}
						description={queryError.message || t("publishReview.error.loadFailed")}
						testId="platform-publish-review-error"
					/>
				</div>
			) : (
				<DataTable
					columns={columns}
					data={data}
					emptyState={
						<div className="p-4">
							<EmptyState
								icon={emptyIcon}
								title={emptyTitle}
								description={emptyDescription}
								testId="platform-publish-review-empty"
							/>
						</div>
					}
					getRowId={(item, index) =>
						typeof item === "object" && item !== null && "id" in item
							? String(item.id)
							: String(index)
					}
					isLoading={isFetching && data.length === 0}
					minWidth={minWidth}
					stickyRightColumnId="actions"
					containerTestId="platform-publish-review-list"
					loadingTestId="platform-publish-review-loading"
					rowTestId="platform-publish-review-row"
				/>
			)}

			{!queryError ? (
				<ListPagination
					previousButtonTestId="publish-review-previous-button"
					nextButtonTestId="publish-review-next-button"
					pageSizeTriggerTestId="publish-review-page-size-trigger"
					pageSizeOptionTestId="publish-review-page-size-option"
					jumpInputTestId="publish-review-jump-input"
					testId="publish-review-pagination"
					showQuickJumper
					className="px-1"
					loading={isFetching}
					onPageChange={onPageChange}
					onPageSizeChange={onPageSizeChange}
					page={page}
					pageSize={pageSize}
					total={total}
				/>
			) : null}
		</div>
	)
}
