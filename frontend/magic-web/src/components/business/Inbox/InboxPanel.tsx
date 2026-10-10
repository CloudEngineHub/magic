import { observer } from "mobx-react-lite"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/shadcn-ui/sheet"
import magicToast from "@/components/base/MagicToaster/utils"
import InboxMessageList from "./InboxMessageList"
import InboxTabs from "./InboxTabs"
import { inboxStore } from "./store"

const InboxPanel = observer(function InboxPanel() {
	const { t, i18n } = useTranslation("sidebar")
	useEffect(() => {
		void inboxStore.loadTemplates(i18n.language)
	}, [i18n.language])

	async function handleMarkAllRead() {
		await inboxStore.markAllSystemRead()
		magicToast.info(t("inbox.toast.markAllRead"))
	}

	return (
		<Sheet
			open={inboxStore.visible}
			onOpenChange={(open) => {
				if (!open) inboxStore.close()
			}}
		>
			<SheetContent
				side="right"
				showClose={false}
				aria-describedby={undefined}
				className="w-[min(520px,100vw)] gap-0 p-0 sm:max-w-[520px]"
				data-testid="inbox-panel"
			>
				<SheetTitle className="sr-only">{t("footer.inbox")}</SheetTitle>
				<header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
					<h2 className="text-lg font-medium text-foreground">{t("footer.inbox")}</h2>
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="sm"
							data-testid="inbox-mark-all-read"
							onClick={() => {
								void handleMarkAllRead()
							}}
						>
							{t("inbox.markAllRead")}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							aria-label={t("inbox.close")}
							data-testid="inbox-close"
							onClick={() => inboxStore.close()}
						>
							<X className="size-4" />
						</Button>
					</div>
				</header>
				<InboxTabs />
				<InboxMessageList />
			</SheetContent>
		</Sheet>
	)
})

export default InboxPanel
