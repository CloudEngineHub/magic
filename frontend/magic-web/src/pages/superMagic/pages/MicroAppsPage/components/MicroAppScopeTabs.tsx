import { useTranslation } from "react-i18next"
import type { MicroAppListScope } from "@/apis/modules/superMagic"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { cn } from "@/utils/cn"

interface MicroAppScopeTabsProps {
	value: MicroAppListScope
	availableScopes: MicroAppListScope[]
	onChange: (scope: MicroAppListScope) => void
	testIdPrefix: string
	className?: string
}

function MicroAppScopeTabs({
	value,
	availableScopes,
	onChange,
	testIdPrefix,
	className,
}: MicroAppScopeTabsProps) {
	const { t } = useTranslation("super")
	const showCollaborated = availableScopes.includes("collaborated")

	return (
		<Tabs value={value} onValueChange={(nextValue) => onChange(nextValue as MicroAppListScope)}>
			<TabsList
				className={cn(
					"grid rounded-xl",
					showCollaborated ? "w-[520px] grid-cols-5" : "w-[416px] grid-cols-4",
					className,
				)}
			>
				<TabsTrigger value="all" data-testid={`${testIdPrefix}-all`}>
					{t("microAppsPage.scopeAll")}
				</TabsTrigger>
				<TabsTrigger value="created" data-testid={`${testIdPrefix}-created`}>
					{t("microAppsPage.scopeCreated")}
				</TabsTrigger>
				{showCollaborated ? (
					<TabsTrigger value="collaborated" data-testid={`${testIdPrefix}-collaborated`}>
						{t("microAppsPage.scopeCollaborated")}
					</TabsTrigger>
				) : null}
				<TabsTrigger value="accessible" data-testid={`${testIdPrefix}-accessible`}>
					{t("microAppsPage.scopeAccessible")}
				</TabsTrigger>
				<TabsTrigger value="recent" data-testid={`${testIdPrefix}-recent`}>
					{t("microAppsPage.scopeRecent")}
				</TabsTrigger>
			</TabsList>
		</Tabs>
	)
}

export default MicroAppScopeTabs
