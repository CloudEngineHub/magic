import { CircleCheck, CircleMinus, Info } from "lucide-react"
import { memo } from "react"
import { useTranslation } from "react-i18next"

/** 全局长期记忆文件的用途与内容边界说明。 */
export const GlobalMemoryUsageGuide = memo(function GlobalMemoryUsageGuide() {
	const { t } = useTranslation("super/longMemory")

	return (
		<div className="shrink-0 border-b border-border bg-muted/20 px-5 py-3">
			<div className="rounded-lg border border-border bg-background px-4 py-3 shadow-xs">
				<div className="flex items-start gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Info size={16} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium text-foreground">
							{t("globalEditor.guide.title")}
						</div>
						<p className="mt-1 text-xs leading-5 text-muted-foreground">
							{t("globalEditor.guide.description")}
						</p>

						<div className="mt-3 grid gap-2 md:grid-cols-2">
							<div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2.5">
								<CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
								<div className="min-w-0">
									<div className="text-xs font-medium text-foreground">
										{t("globalEditor.guide.recommendedTitle")}
									</div>
									<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
										{t("globalEditor.guide.recommendedDescription")}
									</p>
								</div>
							</div>

							<div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2.5">
								<CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0">
									<div className="text-xs font-medium text-foreground">
										{t("globalEditor.guide.notRecommendedTitle")}
									</div>
									<p className="mt-0.5 text-xs leading-5 text-muted-foreground">
										{t("globalEditor.guide.notRecommendedDescription")}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
})
