import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { PageHeaderActionButton } from "@magic-admin-v2/components/page-header-action-button"
import { PageHeaderFilterButton } from "@magic-admin-v2/components/page-header-filter-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@magic-admin-v2/components/ui/tabs"
import { PERMISSION_KEY_MAP } from "@magic-admin-v2/constants/permissions"
import { EmployeeReviewPanel } from "@magic-admin-v2/features/platform-publish-review/components/employee-review-panel"
import { SkillReviewPanel } from "@magic-admin-v2/features/platform-publish-review/components/skill-review-panel"
import type {
	PublishReviewKind,
	PublishReviewVariant,
} from "@magic-admin-v2/features/platform-publish-review/types"
import { useRights } from "@magic-admin-v2/hooks/use-rights"
import { cn } from "@magic-admin-v2/utils/cn"

export default function PlatformPublishReviewPage({
	variant = "platform",
}: {
	variant?: PublishReviewVariant
}) {
	const { t } = useTranslation()
	const hasPlatformEmployeeReviewAccess = useRights([
		PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_REVIEW_QUERY,
		PERMISSION_KEY_MAP.PLATFORM_EMPLOYEE_REVIEW_EDIT,
	])
	const hasPlatformSkillReviewAccess = useRights([
		PERMISSION_KEY_MAP.PLATFORM_SKILL_REVIEW_QUERY,
		PERMISSION_KEY_MAP.PLATFORM_SKILL_REVIEW_EDIT,
	])
	const hasInternalEmployeeReviewAccess = useRights([
		PERMISSION_KEY_MAP.AGENT_REVIEW_QUERY,
		PERMISSION_KEY_MAP.AGENT_REVIEW_EDIT,
	])
	const hasInternalSkillReviewAccess = useRights([
		PERMISSION_KEY_MAP.SKILL_REVIEW_QUERY,
		PERMISSION_KEY_MAP.SKILL_REVIEW_EDIT,
	])
	const canViewEmployeeReview =
		variant === "platform" ? hasPlatformEmployeeReviewAccess : hasInternalEmployeeReviewAccess
	const canViewSkillReview =
		variant === "platform" ? hasPlatformSkillReviewAccess : hasInternalSkillReviewAccess
	const [activeTab, setActiveTab] = useState<PublishReviewKind>("employee")
	const [activeTabFetching, setActiveTabFetching] = useState(false)
	const [refreshToken, setRefreshToken] = useState(0)
	const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
	const [filterCounts, setFilterCounts] = useState<Record<PublishReviewKind, number>>({
		employee: 0,
		skill: 0,
	})
	const handleActiveFetchingChange = useCallback((isFetching: boolean) => {
		setActiveTabFetching(isFetching)
	}, [])
	const handleTabChange = useCallback((value: string) => {
		setMobileFilterOpen(false)
		setActiveTab(value as PublishReviewKind)
	}, [])
	const handleFilterCountChange = useCallback((kind: PublishReviewKind, count: number) => {
		setFilterCounts((previous) =>
			previous[kind] === count ? previous : { ...previous, [kind]: count },
		)
	}, [])

	useEffect(() => {
		if (activeTab === "employee" && !canViewEmployeeReview && canViewSkillReview) {
			setActiveTab("skill")
		}
		if (activeTab === "skill" && !canViewSkillReview && canViewEmployeeReview) {
			setActiveTab("employee")
		}
	}, [activeTab, canViewEmployeeReview, canViewSkillReview])

	return (
		<ListShell
			actions={
				<>
					{canViewEmployeeReview || canViewSkillReview ? (
						<PageHeaderFilterButton
							count={filterCounts[activeTab]}
							label={t("publishReview.filter.title")}
							onClick={() => setMobileFilterOpen(true)}
						/>
					) : null}
					<PageHeaderActionButton
						disabled={activeTabFetching}
						onClick={() => setRefreshToken((previous) => previous + 1)}
						variant="outline"
					>
						<RefreshCw
							className={cn("size-4", activeTabFetching && "animate-spin")}
							aria-hidden="true"
						/>
						{t("common.refresh")}
					</PageHeaderActionButton>
				</>
			}
			description={t(
				variant === "internal"
					? "internalPublishReview.description"
					: "publishReview.description",
			)}
			title={t(
				variant === "internal" ? "internalPublishReview.title" : "publishReview.title",
			)}
		>
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
			>
				<TabsList>
					{canViewEmployeeReview ? (
						<TabsTrigger value="employee">
							{t("publishReview.tab.employee")}
						</TabsTrigger>
					) : null}
					{canViewSkillReview ? (
						<TabsTrigger value="skill">{t("publishReview.tab.skill")}</TabsTrigger>
					) : null}
				</TabsList>
				{canViewEmployeeReview ? (
					<TabsContent forceMount value="employee" className="mt-5 data-[state=inactive]:hidden">
						<EmployeeReviewPanel
							isActive={activeTab === "employee"}
							onFetchingChange={handleActiveFetchingChange}
							onFilterCountChange={(count) => handleFilterCountChange("employee", count)}
							onMobileFilterOpenChange={setMobileFilterOpen}
							mobileFilterOpen={mobileFilterOpen}
							refreshToken={refreshToken}
							variant={variant}
						/>
					</TabsContent>
				) : null}
				{canViewSkillReview ? (
					<TabsContent forceMount value="skill" className="mt-5 data-[state=inactive]:hidden">
						<SkillReviewPanel
							isActive={activeTab === "skill"}
							onFetchingChange={handleActiveFetchingChange}
							onFilterCountChange={(count) => handleFilterCountChange("skill", count)}
							onMobileFilterOpenChange={setMobileFilterOpen}
							mobileFilterOpen={mobileFilterOpen}
							refreshToken={refreshToken}
							variant={variant}
						/>
					</TabsContent>
				) : null}
			</Tabs>
		</ListShell>
	)
}
