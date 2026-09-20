import { MessageCircle, SquarePen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { matchPath, useLocation } from "react-router"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { RoutePath } from "@/constants/routes"
import { useNavigateToSuperHome } from "@/layouts/BaseLayout/components/MagicSidebar/hooks/useNavigateToSuperHome"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"

export default function HomeModeTabs() {
	const { t } = useTranslation("super/mainInput")
	const { pathname } = useLocation()
	const navigate = useNavigate()
	const { navigateToSuperHome } = useNavigateToSuperHome()
	const isChatHome = Boolean(matchPath(`/:clusterCode${RoutePath.SuperChatHome}`, pathname))
	const isTaskHome = [RoutePath.Super, RoutePath.SuperWorkspaceState].some((path) =>
		matchPath(`/:clusterCode${path}`, pathname),
	)

	// The input container is shared with other scenes; only the two creation homes show tabs.
	if (!isChatHome && !isTaskHome) return null

	return (
		<Tabs
			value={isChatHome ? "chat" : "task"}
			activationMode="manual"
			onValueChange={(value) => {
				// Reuse sidebar navigation so task workspace restoration stays identical.
				if (value === "task") navigateToSuperHome()
				else navigate({ name: RouteName.SuperChatHome, viewTransition: false })
			}}
		>
			<TabsList aria-label={t("homeMode.label")} className="h-14 w-64 rounded-xl p-1.5">
				<TabsTrigger
					value="chat"
					className="gap-2 rounded-lg text-base font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground"
				>
					<MessageCircle className="size-4" />
					{t("homeMode.chat")}
				</TabsTrigger>
				<TabsTrigger
					value="task"
					className="gap-2 rounded-lg text-base font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground"
				>
					<SquarePen className="size-4" />
					{t("homeMode.task")}
				</TabsTrigger>
			</TabsList>
		</Tabs>
	)
}
