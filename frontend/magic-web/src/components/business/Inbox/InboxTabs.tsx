import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { cn } from "@/utils/cn"
import InboxUnreadBadge from "./InboxUnreadBadge"
import { inboxStore } from "./store"
import type { InboxTab } from "./types"

const TAB_TRIGGER_CLASS =
	"relative h-12 flex-none rounded-none border-0 px-0 text-[15px] font-normal text-[#818899] shadow-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full dark:text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:bg-[#5f6de2] dark:data-[state=active]:bg-transparent"

const InboxTabs = observer(function InboxTabs({ mobile = false }: { mobile?: boolean }) {
	const { t } = useTranslation("sidebar")

	return (
		<Tabs
			value={inboxStore.activeTab}
			onValueChange={(nextValue) => {
				if (nextValue === "all" || nextValue === "system" || nextValue === "auth") {
					void inboxStore.setActiveTab(nextValue)
				}
			}}
			className={cn(
				"min-w-0 border-b border-[#eceef2] dark:border-border",
				mobile ? "px-3" : "px-[22px]",
			)}
		>
			<TabsList
				className={cn(
					"h-auto w-full justify-start rounded-none bg-transparent p-0",
					mobile ? "grid grid-cols-3" : "gap-[26px]",
				)}
				aria-label={t("inbox.tabsAria")}
			>
				<TabsTrigger
					value={"all" satisfies InboxTab}
					className={cn(TAB_TRIGGER_CLASS, mobile && "text-sm after:inset-x-1/4")}
					data-testid="inbox-tab-all"
					onClick={() => {
						void inboxStore.setActiveTab("all")
					}}
				>
					{t("inbox.tabs.all")}
				</TabsTrigger>
				<TabsTrigger
					value={"system" satisfies InboxTab}
					className={cn(
						TAB_TRIGGER_CLASS,
						"gap-[5px]",
						mobile && "text-sm after:inset-x-1/4",
					)}
					data-testid="inbox-tab-system"
					onClick={() => {
						void inboxStore.setActiveTab("system")
					}}
				>
					{t("inbox.tabs.system")}
					<InboxUnreadBadge
						label={inboxStore.unreadSystemLabel}
						variant="system"
						testId="inbox-tab-system-badge"
					/>
				</TabsTrigger>
				<TabsTrigger
					value={"auth" satisfies InboxTab}
					className={cn(
						TAB_TRIGGER_CLASS,
						"gap-[5px]",
						mobile && "text-sm after:inset-x-1/4",
					)}
					data-testid="inbox-tab-auth"
					onClick={() => {
						void inboxStore.setActiveTab("auth")
					}}
				>
					{t("inbox.tabs.auth")}
					<InboxUnreadBadge
						label={inboxStore.unreadAuthLabel}
						variant="auth"
						testId="inbox-tab-auth-badge"
					/>
				</TabsTrigger>
			</TabsList>
		</Tabs>
	)
})

export default InboxTabs
