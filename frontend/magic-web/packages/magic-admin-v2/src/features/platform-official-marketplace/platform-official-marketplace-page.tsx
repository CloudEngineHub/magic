import { RefreshCw } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { ListShell } from "@magic-admin-v2/components/list-shell"
import { PageHeaderActionButton } from "@magic-admin-v2/components/page-header-action-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@magic-admin-v2/components/ui/tabs"
import { EmployeeMarketPanel } from "@magic-admin-v2/features/platform-official-marketplace/components/employee-market-panel"
import { SkillMarketPanel } from "@magic-admin-v2/features/platform-official-marketplace/components/skill-market-panel"
import type { MarketKind } from "@magic-admin-v2/features/platform-official-marketplace/types"
import {
	getOfficialMarketplacePermissions,
	resolveOfficialMarketplaceTab,
} from "@magic-admin-v2/features/platform-official-marketplace/utils"
import { useRuntime } from "@magic-admin-v2/runtime/context"
import { cn } from "@magic-admin-v2/utils/cn"

/** Top-level page orchestration; tab-specific data and mutations live in their panels. */
export default function PlatformOfficialMarketplacePage() {
	const { t } = useTranslation()
	const { access } = useRuntime()
	const [selectedTab, setSelectedTab] = useState<MarketKind>("employee")
	const [activeTabFetching, setActiveTabFetching] = useState(false)
	const [refreshToken, setRefreshToken] = useState(0)
	const { availableTabs, canEditEmployee, canEditSkill, canViewEmployee, canViewSkill } =
		getOfficialMarketplacePermissions(access)
	const activeTab = resolveOfficialMarketplaceTab(selectedTab, availableTabs)
	const handleInitialLoadingChange = useCallback(() => undefined, [])
	const handleActiveFetchingChange = useCallback((isFetching: boolean) => {
		setActiveTabFetching(isFetching)
	}, [])

	return (
		<ListShell
				testId="official-marketplace-page"
			actions={
				<PageHeaderActionButton
					disabled={!activeTab || activeTabFetching}
					onClick={() => setRefreshToken((previous) => previous + 1)}
					variant="outline"
				 data-testid="platform-official-marketplace-refresh-button">
					<RefreshCw
						className={cn("size-4", activeTabFetching && "animate-spin")}
						aria-hidden="true"
					/>
					{t("common.refresh")}
				</PageHeaderActionButton>
			}
			description={t("officialMarketplace.description")}
			title={t("officialMarketplace.title")}
		>
			<Tabs
				value={activeTab ?? ""}
				onValueChange={(value) => setSelectedTab(value as MarketKind)}
			>
				<TabsList>
					{canViewEmployee ? (
						<TabsTrigger value="employee" data-testid="platform-official-marketplace-tab-trigger">
							{t("officialMarketplace.tab.employee")}
						</TabsTrigger>
					) : null}
					{canViewSkill ? (
						<TabsTrigger value="skill" data-testid="platform-official-marketplace-tab-trigger">
							{t("officialMarketplace.tab.skill")}
						</TabsTrigger>
					) : null}
				</TabsList>

				{canViewEmployee ? (
					<TabsContent value="employee" className="mt-4">
						<EmployeeMarketPanel
							canEdit={canEditEmployee}
							isActive={activeTab === "employee"}
							onFetchingChange={handleActiveFetchingChange}
							onInitialLoadingChange={handleInitialLoadingChange}
							refreshToken={refreshToken}
						/>
					</TabsContent>
				) : null}

				{canViewSkill ? (
					<TabsContent value="skill" className="mt-4">
						<SkillMarketPanel
							canEdit={canEditSkill}
							isActive={activeTab === "skill"}
							onFetchingChange={handleActiveFetchingChange}
							onInitialLoadingChange={handleInitialLoadingChange}
							refreshToken={refreshToken}
						/>
					</TabsContent>
				) : null}
			</Tabs>
		</ListShell>
	)
}
