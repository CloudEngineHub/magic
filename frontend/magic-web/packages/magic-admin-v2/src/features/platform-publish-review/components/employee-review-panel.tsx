import type { ColumnDef } from "@tanstack/react-table"
import { Bot } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import { useI18n } from "@magic-admin-v2/i18n/use-i18n"
import type { ApiError } from "@magic-admin-v2/api/types"
import { useReviewAgentVersionMutation } from "@magic-admin-v2/features/platform-publish-review/mutations"
import { useAgentReviewListQuery } from "@magic-admin-v2/features/platform-publish-review/queries"
import {
	type AgentVersionReviewItem,
	type PublishReviewAction,
	type PublishReviewPublisherType,
	type PublishReviewVariant,
} from "@magic-admin-v2/features/platform-publish-review/types"
import { useRights } from "@magic-admin-v2/hooks/use-rights"
import {
	canReviewRecord,
	getLocalizedRoles,
	getLocalizedText,
	type ReviewDialogState,
} from "@magic-admin-v2/features/platform-publish-review/formatters"
import {
	createDefaultFilterDraft,
	createReviewPayload,
	toAgentReviewParams,
} from "@magic-admin-v2/features/platform-publish-review/params"
import { useListQueryParams } from "@magic-admin-v2/hooks/use-list-query-params"
import {
	createReviewActionColumn,
	createReviewVersionColumn,
	createSharedReviewColumns,
} from "@magic-admin-v2/features/platform-publish-review/components/review-columns"
import {
	ClampedText,
	NameCell,
	OrganizationCell,
	PublishTargetCell,
} from "@magic-admin-v2/features/platform-publish-review/components/review-cells"
import { ReviewActionDialogs } from "@magic-admin-v2/features/platform-publish-review/components/review-action-dialogs"
import { ReviewListPanel } from "@magic-admin-v2/features/platform-publish-review/components/review-list-panel"
import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"

export function EmployeeReviewPanel({
	isActive,
	onFetchingChange,
	refreshToken,
	variant,
}: {
	isActive: boolean
	onFetchingChange: (isFetching: boolean) => void
	refreshToken: number
	variant: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const { language } = useI18n()
	const hasPlatformEditRight = useRights(PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_REVIEW_EDIT)
	const hasInternalEditRight = useRights(PERMISSION_KEY_MAP.AGENT_REVIEW_EDIT)
	const hasEditRight = variant === "platform" ? hasPlatformEditRight : hasInternalEditRight
	const {
		filterDraft,
		page,
		pageSize,
		params,
		setDebouncedField,
		setFilterDraft,
		setPage,
		setPageSize,
	} = useListQueryParams({
		debounceFields: ["search_value"],
		initialDraft: () => createDefaultFilterDraft("employee", variant),
		toParams: toAgentReviewParams,
	})
	const [reviewDialog, setReviewDialog] =
		useState<ReviewDialogState<AgentVersionReviewItem>>(null)
	const query = useAgentReviewListQuery(params, isActive, variant)
	const { refetch } = query
	const mutation = useReviewAgentVersionMutation(variant)

	useEffect(() => {
		if (isActive) onFetchingChange(query.isFetching)
	}, [isActive, onFetchingChange, query.isFetching])

	useEffect(() => {
		if (isActive && refreshToken > 0) void refetch()
	}, [isActive, refetch, refreshToken])

	const columns = useMemo<Array<ColumnDef<AgentVersionReviewItem>>>(
		() => [
			{
				id: "name",
				size: 260,
				header: t("publishReview.column.employeeName"),
				cell: ({ row }) => (
					<NameCell
						fallbackIcon={<Bot className="size-4" aria-hidden="true" />}
						name={getLocalizedText(row.original.name_i18n, language)}
						secondary={`${t("publishReview.column.employeeCode")}: ${row.original.code || t("common.emptyValue")}`}
					/>
				),
			},
			{
				id: "organization",
				size: 240,
				header: t("publishReview.column.organization"),
				cell: ({ row }) => (
					<OrganizationCell
						code={row.original.organization?.code || row.original.organization_code}
						name={row.original.organization?.name}
					/>
				),
			},
			{
				id: "role",
				size: 260,
				header: t("publishReview.column.role"),
				cell: ({ row }) => (
					<ClampedText value={getLocalizedRoles(row.original.role_i18n, language)} />
				),
			},
			createReviewVersionColumn<AgentVersionReviewItem>({ t }),
			{
				id: "publish_target_type",
				size: 200,
				header: t("publishReview.column.publishTargetType"),
				cell: ({ row }) => (
					<PublishTargetCell
						targetType={row.original.publish_target_type}
						targetValue={row.original.publish_target_value}
					/>
				),
			},
			...createSharedReviewColumns<AgentVersionReviewItem>({ t }),
			{
				id: "published_at",
				size: 180,
				header: t("publishReview.column.publishedAt"),
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-muted-foreground">
						{row.original.published_at || "-"}
					</span>
				),
			},
			createReviewActionColumn<AgentVersionReviewItem>({
				canReview: (record) => hasEditRight && canReviewRecord(record),
				onReview: (record, action) => setReviewDialog({ action, record }),
				pendingId: mutation.isPending ? reviewDialog?.record.id : undefined,
				t,
			}),
		],
		[hasEditRight, language, mutation.isPending, reviewDialog?.record.id, t],
	)

	async function handleReview(values: {
		action: PublishReviewAction
		publisherType?: PublishReviewPublisherType
		reviewRemark?: string
		record: AgentVersionReviewItem
	}) {
		if (!hasEditRight || !canReviewRecord(values.record)) return
		await mutation.mutateAsync({
			id: values.record.id,
			values: createReviewPayload(values, variant),
		})
		toast.success(t("publishReview.message.reviewSuccess"))
	}

	return (
		<>
			<ReviewListPanel
				columns={columns}
				data={query.data?.list ?? []}
				emptyDescription={t("publishReview.empty.employeeDescription")}
				emptyIcon={Bot}
				emptyTitle={t("publishReview.empty.employeeTitle")}
				filterDraft={filterDraft}
				isFetching={query.isFetching}
				kind="employee"
				minWidth={1960}
				onDraftChange={setFilterDraft}
				onPageChange={setPage}
				onPageSizeChange={setPageSize}
				onSearchValueChange={(value) => setDebouncedField("search_value", value)}
				page={page}
				pageSize={pageSize}
				queryError={query.error as ApiError | null}
				total={query.data?.total ?? 0}
				variant={variant}
			/>
			<ReviewActionDialogs
				dialogState={reviewDialog}
				isPending={mutation.isPending}
				onClose={() => setReviewDialog(null)}
				onConfirm={handleReview}
				variant={variant}
			/>
		</>
	)
}
