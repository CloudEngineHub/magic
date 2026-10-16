import type { ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { AlertCircle, type LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { ApiError } from "@magic-admin-v2/api/types"
import { DataTable } from "@magic-admin-v2/components/data-table"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { ListPagination } from "@magic-admin-v2/components/list-pagination"
import { MarketFilters } from "@magic-admin-v2/features/platform-official-marketplace/components/market-filter-controls"
import {
	type MarketCategoryOption,
	type MarketDraftUpdater,
	type MarketFilterDraft,
	type MarketKind,
} from "@magic-admin-v2/features/platform-official-marketplace/types"

type MarketListPanelProps<TData> = {
	categoryOptions?: MarketCategoryOption[]
	categoryOptionsLoading?: boolean
	codeLabel: string
	codePlaceholder: string
	columns: Array<ColumnDef<TData>>
	data: TData[]
	emptyDescription: string
	emptyIcon: LucideIcon
	emptyTitle: string
	filterDraft: MarketFilterDraft
	isFetching: boolean
	kind: MarketKind
	minWidth: number
	onDraftChange: (value: MarketDraftUpdater) => void
	onPageChange: (page: number) => void
	onPageSizeChange: (pageSize: number) => void
	page: number
	pageSize: number
	queryError: ApiError | null
	showCategoryFilter?: boolean
	showPackageName: boolean
	stickyLeftColumnId?: string
	toolbarActions?: ReactNode
	total: number
}

/** Shared list frame; tab-specific queries and mutations stay in the owning panel. */
export function MarketListPanel<TData>({
	categoryOptions,
	categoryOptionsLoading,
	codeLabel,
	codePlaceholder,
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
	queryError,
	showCategoryFilter,
	showPackageName,
	stickyLeftColumnId,
	toolbarActions,
	total,
}: MarketListPanelProps<TData>) {
	const { t } = useTranslation()

	return (
		<div className="space-y-4">
			{/* Keep marketplace filters aligned with the approval list while the table scrolls. */}
			<div className="sticky top-0 z-40 -mx-4 bg-background px-4 py-2 lg:-mx-6 lg:px-6">
				<MarketFilters
					categoryOptions={categoryOptions}
					categoryOptionsLoading={categoryOptionsLoading}
					codeLabel={codeLabel}
					codePlaceholder={codePlaceholder}
					filterDraft={filterDraft}
					kind={kind}
					onDraftChange={onDraftChange}
					showCategoryFilter={showCategoryFilter}
					showPackageName={showPackageName}
					toolbarActions={toolbarActions}
				/>
			</div>

			{queryError ? (
				<div className="rounded-lg border border-border/50 p-4">
					<EmptyState
						icon={AlertCircle}
						title={t("officialMarketplace.error.loadTitle")}
						description={
							queryError.message || t("officialMarketplace.error.loadFailed")
						}
						testId="platform-official-marketplace-error"/>
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
							 testId="platform-official-marketplace-empty"/>
						</div>
					}
					getRowId={(item, index) =>
						typeof item === "object" && item !== null && "id" in item
							? String(item.id)
							: String(index)
					}
					isLoading={isFetching && data.length === 0}
					minWidth={minWidth}
					stickyLeftColumnId={stickyLeftColumnId}
				 containerTestId="platform-official-marketplace-list" loadingTestId="platform-official-marketplace-loading" rowTestId="platform-official-marketplace-row"/>
			)}

			{!queryError ? (
				<ListPagination
					previousButtonTestId="official-marketplace-previous-button"
					nextButtonTestId="official-marketplace-next-button"
					pageSizeTriggerTestId="official-marketplace-page-size-trigger"
					pageSizeOptionTestId="official-marketplace-page-size-option"
					jumpInputTestId="official-marketplace-jump-input"
				testId="official-marketplace-pagination"
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
