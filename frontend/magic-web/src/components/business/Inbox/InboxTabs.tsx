import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { cn } from "@/utils/cn"
import InboxUnreadBadge from "./InboxUnreadBadge"
import { inboxStore } from "./store"
import type { InboxTab } from "./types"

const TAB_TRIGGER_CLASS =
	"h-8 rounded-none border-0 px-0 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"

const InboxTabs = observer(function InboxTabs() {
	const { t } = useTranslation("sidebar")

	return (
		<Tabs
			value={inboxStore.activeTab}
			onValueChange={(nextValue) => {
				if (nextValue === "all" || nextValue === "system" || nextValue === "auth") {
					void inboxStore.setActiveTab(nextValue)
				}
			}}
			className="min-w-0 border-b border-border px-4"
		>
			<TabsList
				className="h-auto w-full justify-start gap-6 rounded-none bg-transparent p-0"
				aria-label={t("inbox.tabsAria")}
			>
				<TabsTrigger
					value={"all" satisfies InboxTab}
					className={TAB_TRIGGER_CLASS}
					data-testid="inbox-tab-all"
					onClick={() => {
						void inboxStore.setActiveTab("all")
					}}
				>
					{t("inbox.tabs.all")}
				</TabsTrigger>
				<TabsTrigger
					value={"system" satisfies InboxTab}
					className={cn(TAB_TRIGGER_CLASS, "gap-1.5")}
					data-testid="inbox-tab-system"
					onClick={() => {
						void inboxStore.setActiveTab("system")
					}}
				>
					{t("inbox.tabs.system")}
					<InboxUnreadBadge
						label={inboxStore.unreadSystemLabel}
						testId="inbox-tab-system-badge"
					/>
				</TabsTrigger>
				<TabsTrigger
					value={"auth" satisfies InboxTab}
					className={cn(TAB_TRIGGER_CLASS, "gap-1.5")}
					data-testid="inbox-tab-auth"
					onClick={() => {
						void inboxStore.setActiveTab("auth")
					}}
				>
					{t("inbox.tabs.auth")}
					<InboxUnreadBadge
						label={inboxStore.unreadAuthLabel}
						testId="inbox-tab-auth-badge"
					/>
				</TabsTrigger>
			</TabsList>
		</Tabs>
	)
})

export default InboxTabs
