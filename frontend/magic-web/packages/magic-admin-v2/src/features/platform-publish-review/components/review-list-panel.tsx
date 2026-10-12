import type { ColumnDef } from "@tanstack/react-table"
import { AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { ListFilterPanel } from "@magic-admin-v2/components/list-filter-panel"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import {
	type PublishReviewFilterDraft,
	type PublishReviewKind,
	type PublishReviewVariant,
} from "@magic-admin-v2/features/platform-publish-review/types"
import { createDefaultFilterDraft, type ReviewDraftUpdater } from "@magic-admin-v2/features/platform-publish-review/params"
import { AdvancedFilterControls } from "@magic-admin-v2/features/platform-publish-review/components/review-filters"
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
	page,
	pageSize,
	mobileFilterOpen,
	onMobileFilterOpenChange,
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
	page: number
	pageSize: number
	mobileFilterOpen: boolean
	onMobileFilterOpenChange: (open: boolean) => void
	queryError: ApiError | null
	total: number
	variant: PublishReviewVariant
}) {
	const { t } = useTranslation()

	return (
		<div className="space-y-4">
			<ListFilterPanel
				applyLabel={t("publishReview.filter.apply")}
				createDefaultValue={() => createDefaultFilterDraft(kind, variant)}
				onChange={(patch) => onDraftChange((previous) => ({ ...previous, ...patch }))}
				onReset={() => onDraftChange(createDefaultFilterDraft(kind, variant))}
				mobileOpen={mobileFilterOpen}
				onMobileOpenChange={onMobileFilterOpenChange}
				showMobileTrigger={false}
				renderFields={(props) => (
					<AdvancedFilterControls {...props} kind={kind} variant={variant} />
				)}
				resetLabel={t("publishReview.action.reset")}
				title={t("publishReview.filter.title")}
				value={filterDraft}
			/>

			{queryError ? (
				<div className="rounded-lg border border-border/50 p-4">
					<EmptyState
						icon={AlertCircle}
						title={t("publishReview.error.loadTitle")}
						description={queryError.message || t("publishReview.error.loadFailed")}
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
				/>
			)}

			{!queryError ? (
				<ListPagination
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
