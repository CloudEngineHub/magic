import { Brain, Database, File, Monitor, Timer } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import IconShareCog from "@/enhance/tabler/icons-react/icons/iconShareCog"
import { cn } from "@/lib/utils"

export type MicroAppWorkspaceView =
	| "preview"
	| "files"
	| "database"
	| "scheduledTasks"
	| "shareManagement"
	| "longMemory"

interface MicroAppWorkspaceNavProps {
	activeView: MicroAppWorkspaceView
	databaseDisabled?: boolean
	projectPanelDisabled?: boolean
	hideScheduledTasks?: boolean
	onViewChange: (view: MicroAppWorkspaceView) => void
}

export default function MicroAppWorkspaceNav({
	activeView,
	databaseDisabled = false,
	projectPanelDisabled = false,
	hideScheduledTasks = false,
	onViewChange,
}: MicroAppWorkspaceNavProps) {
	const { t } = useTranslation("super")
	const items = [
		{
			view: "preview" as const,
			label: t("microAppPage.navigation.preview"),
			icon: Monitor,
			testId: "micro-app-nav-preview",
		},
		{
			view: "files" as const,
			label: t("microAppPage.navigation.files"),
			icon: File,
			testId: "micro-app-nav-files",
		},
		{
			view: "database" as const,
			label: t("microAppPage.navigation.database"),
			icon: Database,
			testId: "micro-app-nav-database",
			disabled: databaseDisabled,
		},
		...(!hideScheduledTasks
			? [
					{
						view: "scheduledTasks" as const,
						label: t("microAppPage.navigation.scheduledTasks"),
						icon: Timer,
						testId: "micro-app-nav-scheduled-tasks",
						disabled: projectPanelDisabled,
					},
				]
			: []),
		{
			view: "shareManagement" as const,
			label: t("microAppPage.navigation.shareManagement"),
			icon: IconShareCog,
			testId: "micro-app-nav-share-management",
			disabled: projectPanelDisabled,
		},
		{
			view: "longMemory" as const,
			label: t("microAppPage.navigation.longMemory"),
			icon: Brain,
			testId: "micro-app-nav-long-memory",
			disabled: projectPanelDisabled,
		},
	]

	return (
		<aside
			className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/20 py-2"
			aria-label={t("microAppPage.navigation.ariaLabel")}
			data-testid="micro-app-workspace-nav"
		>
			{items.map(({ view, label, icon: Icon, testId, disabled }) => {
				const active = activeView === view
				return (
					<Tooltip key={view}>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className={cn(
									"size-8 text-muted-foreground",
									active && "bg-secondary text-secondary-foreground",
								)}
								aria-label={label}
								aria-current={active ? "page" : undefined}
								disabled={disabled}
								onClick={() => onViewChange(view)}
								data-testid={testId}
							>
								<Icon size={16} color="currentColor" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">{label}</TooltipContent>
					</Tooltip>
				)
			})}
		</aside>
	)
}
