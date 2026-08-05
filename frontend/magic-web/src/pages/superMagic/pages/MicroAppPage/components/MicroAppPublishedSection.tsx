import { Copy, Rocket } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"

interface MicroAppPublishedSectionProps {
	mobile: boolean
	publishedAtText: string
	accessUrl: string
	hasUnsavedPublishedChanges: boolean
	onCopyAccessUrl: () => void
	onCopyShareText: () => void
}

/** 展示已发布状态与复制入口，始终放在发布弹窗表单的最上方。 */
export default function MicroAppPublishedSection({
	mobile,
	publishedAtText,
	accessUrl,
	hasUnsavedPublishedChanges,
	onCopyAccessUrl,
	onCopyShareText,
}: MicroAppPublishedSectionProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/20"
			data-testid="micro-app-published-section"
		>
			<div className="flex items-center gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
					<Rocket className="size-4" />
				</div>
				<div>
					<p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
						{t("microAppPage.publish.published")}
					</p>
					{publishedAtText ? (
						<p className="mt-0.5 text-xs text-emerald-700/75 dark:text-emerald-300/75">
							{t("microAppPage.publish.publishedAt", {
								time: publishedAtText,
							})}
						</p>
					) : null}
				</div>
			</div>
			{accessUrl ? (
				<div
					className="mt-4 rounded-lg border border-border/80 bg-background/90 p-3 shadow-sm dark:bg-background/80"
					data-testid="micro-app-publish-quick-share"
				>
					<div
						className={cn(
							"flex gap-3",
							mobile ? "flex-col items-stretch" : "items-center justify-between",
						)}
					>
						<div className="min-w-0">
							<p className="text-sm font-medium text-foreground">
								{t("microAppPage.publish.quickShareTitle")}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{t("microAppPage.publish.quickShareDescription")}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className={cn("h-8 gap-1.5", mobile && "flex-1")}
								onClick={onCopyAccessUrl}
								disabled={hasUnsavedPublishedChanges}
								aria-describedby={
									hasUnsavedPublishedChanges
										? "micro-app-publish-settings-changed"
										: undefined
								}
								data-testid="micro-app-publish-copy-link"
							>
								<Copy className="size-3.5" />
								{t("microAppPage.publish.copyLink")}
							</Button>
							<Button
								type="button"
								size="sm"
								className={cn("h-8 gap-1.5", mobile && "flex-1")}
								onClick={onCopyShareText}
								disabled={hasUnsavedPublishedChanges}
								aria-describedby={
									hasUnsavedPublishedChanges
										? "micro-app-publish-settings-changed"
										: undefined
								}
								data-testid="micro-app-publish-copy-share-text"
							>
								<Copy className="size-3.5" />
								{t("microAppPage.publish.copyShareText")}
							</Button>
						</div>
					</div>
					<Input
						readOnly
						value={accessUrl}
						className="mt-3 h-9 min-w-0 bg-background"
						data-testid="micro-app-publish-access-url"
					/>
					{hasUnsavedPublishedChanges ? (
						<p
							id="micro-app-publish-settings-changed"
							className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
							role="status"
							data-testid="micro-app-publish-settings-changed"
						>
							{t("microAppPage.publish.settingsChanged")}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	)
}
