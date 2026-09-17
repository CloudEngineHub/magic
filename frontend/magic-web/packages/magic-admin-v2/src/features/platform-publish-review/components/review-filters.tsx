import { useTranslation } from "react-i18next"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import {
	relativeUnit,
	TimeFilterPanel,
} from "@magic-admin-v2/components/time-filter-panel"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import {
	publishReviewPublishStatus,
	publishReviewSelectAllValue,
	publishReviewStatus,
	publishReviewTargetType,
	type PublishReviewFilterDraft,
	type PublishReviewKind,
	type PublishReviewOrderBy,
	type PublishReviewVariant,
} from "@magic-admin-v2/features/platform-publish-review/types"
import {
	getPublishStatusLabel,
	getPublishTargetTypeLabel,
	getReviewStatusLabel,
} from "@magic-admin-v2/features/platform-publish-review/formatters"
import type { ReviewDraftUpdater } from "@magic-admin-v2/features/platform-publish-review/params"

const dayOnlyRelativeUnits = [relativeUnit.day] as const

export function AdvancedFilterControls({
	filterDraft,
	kind,
	onDraftChange,
	variant,
}: {
	filterDraft: PublishReviewFilterDraft
	kind: PublishReviewKind
	onDraftChange: (value: ReviewDraftUpdater) => void
	variant: PublishReviewVariant
}) {
	const { t } = useTranslation()

	return (
		<>
			{kind === "employee" ? (
				<>
					<SearchInput
						label={t("publishReview.filter.employeeName")}
						onChange={(value) =>
							onDraftChange((previous) => ({ ...previous, name_i18n: value }))
						}
						placeholder={t("publishReview.placeholder.employeeName")}
						value={filterDraft.name_i18n}
					/>
					{variant === "platform" ? (
						<SearchInput
							label={t("publishReview.filter.organizationCode")}
							onChange={(value) =>
								onDraftChange((previous) => ({
									...previous,
									organization_code: value,
								}))
							}
							placeholder={t("publishReview.placeholder.organizationCode")}
							value={filterDraft.organization_code}
						/>
					) : null}
				</>
			) : (
				<SearchInput
					label={
						variant === "internal"
							? t("publishReview.filter.skillName")
							: t("publishReview.filter.packageName")
					}
					onChange={(value) =>
						onDraftChange((previous) =>
							variant === "internal"
								? { ...previous, skill_name: value }
								: { ...previous, package_name: value },
						)
					}
					placeholder={
						variant === "internal"
							? t("publishReview.placeholder.skillName")
							: t("publishReview.placeholder.packageName")
					}
					value={
						variant === "internal" ? filterDraft.skill_name : filterDraft.package_name
					}
				/>
			)}
			<SearchInput
				label={t("publishReview.filter.version")}
				onChange={(value) => onDraftChange((previous) => ({ ...previous, version: value }))}
				placeholder={t("publishReview.placeholder.version")}
				value={filterDraft.version}
			/>
			<ReviewStatusSelect
				className="w-full"
				triggerClassName="w-full"
				label={t("publishReview.filter.reviewStatus")}
				onChange={(value) =>
					onDraftChange((previous) => ({ ...previous, review_status: value }))
				}
				value={filterDraft.review_status}
				variant={variant}
			/>
			<PublishStatusSelect
				className="w-full"
				triggerClassName="w-full"
				label={t("publishReview.filter.publishStatus")}
				onChange={(value) =>
					onDraftChange((previous) => ({ ...previous, publish_status: value }))
				}
				value={filterDraft.publish_status}
				variant={variant}
			/>
			<PublishTargetTypeSelect
				className="w-full"
				triggerClassName="w-full"
				label={t("publishReview.filter.publishTargetType")}
				onChange={(value) =>
					onDraftChange((previous) => ({ ...previous, publish_target_type: value }))
				}
				value={filterDraft.publish_target_type}
				variant={variant}
			/>
			<FilterControlField className="w-full" label={t("publishReview.filter.orderBy")}>
				<Select
					value={filterDraft.order_by}
					onValueChange={(value) =>
						onDraftChange((previous) => ({
							...previous,
							order_by: value as PublishReviewOrderBy,
						}))
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="desc">{t("publishReview.order.desc")}</SelectItem>
						<SelectItem value="asc">{t("publishReview.order.asc")}</SelectItem>
					</SelectContent>
				</Select>
			</FilterControlField>
			<FilterControlField className="w-full" label={t("publishReview.filter.createdAt")}>
				<TimeFilterPanel
					className="w-full"
					onChange={(timeRange) =>
					onDraftChange((previous) => ({
						...previous,
						end_time: timeRange?.endDate.slice(0, 10) ?? "",
						start_time: timeRange?.startDate.slice(0, 10) ?? "",
						time_range: timeRange,
					}))
				}
					presentation="inline"
					supportedRelativeUnits={dayOnlyRelativeUnits}
					timePrecision="day"
					value={filterDraft.time_range}
				/>
			</FilterControlField>
		</>
	)
}

export function SearchInput({
	label,
	onChange,
	placeholder,
	value,
}: {
	label: string
	onChange: (value: string) => void
	placeholder: string
	value: string
}) {
	const { t } = useTranslation()

	return (
		<FilterControlField className="w-full" label={label}>
			<FilterSearchInput
				aria-label={label}
				clearLabel={t("common.clear")}
				containerClassName="min-w-0"
				onValueChange={onChange}
				placeholder={placeholder}
				value={value}
			/>
		</FilterControlField>
	)
}

export function ReviewStatusSelect({
	className,
	label,
	onChange,
	triggerClassName = "w-fit max-w-full",
	value,
	variant = "platform",
}: {
	className?: string
	label: string
	onChange: (value: string) => void
	triggerClassName?: string
	value: string
	variant?: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const statuses =
		variant === "internal"
			? [
					publishReviewStatus.underReview,
					publishReviewStatus.approved,
					publishReviewStatus.rejected,
				]
			: Object.values(publishReviewStatus)

	return (
		<FilterControlField className={className} label={label}>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className={triggerClassName}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={publishReviewSelectAllValue}>
						{t("publishReview.filter.all")}
					</SelectItem>
					{statuses.map((status) => (
						<SelectItem key={status} value={status}>
							{getReviewStatusLabel(status, t)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FilterControlField>
	)
}

export function PublishStatusSelect({
	className,
	label,
	onChange,
	triggerClassName = "w-fit max-w-full",
	value,
	variant = "platform",
}: {
	className?: string
	label: string
	onChange: (value: string) => void
	triggerClassName?: string
	value: string
	variant?: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const statuses =
		variant === "internal"
			? [publishReviewPublishStatus.unpublished, publishReviewPublishStatus.published]
			: Object.values(publishReviewPublishStatus)

	return (
		<FilterControlField className={className} label={label}>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className={triggerClassName}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={publishReviewSelectAllValue}>
						{t("publishReview.filter.all")}
					</SelectItem>
					{statuses.map((status) => (
						<SelectItem key={status} value={status}>
							{getPublishStatusLabel(status, t)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FilterControlField>
	)
}

export function PublishTargetTypeSelect({
	className,
	label,
	onChange,
	triggerClassName = "w-fit max-w-full",
	value,
	variant = "platform",
}: {
	className?: string
	label: string
	onChange: (value: string) => void
	triggerClassName?: string
	value: string
	variant?: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const targetTypes =
		variant === "internal"
			? [publishReviewTargetType.member, publishReviewTargetType.organization]
			: Object.values(publishReviewTargetType)

	return (
		<FilterControlField className={className} label={label}>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className={triggerClassName}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={publishReviewSelectAllValue}>
						{t("publishReview.filter.all")}
					</SelectItem>
					{targetTypes.map((type) => (
						<SelectItem key={type} value={type}>
							{getPublishTargetTypeLabel(type, t)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</FilterControlField>
	)
}
