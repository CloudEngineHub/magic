import { useTranslation } from "react-i18next"
import { HelpIllustration } from "@/components/shadcn-composed/context-help/HelpIllustration"

/** 解释整理前后用户能感知的变化；图示与示例不表示当前会话的实时状态。 */
export default function ContextUsageHelpContent() {
	const { t } = useTranslation("super")

	return (
		<article className="space-y-7">
			<section className="space-y-2">
				<h3 className="text-lg font-semibold">{t("ui.tokenUsage.help.capacityTitle")}</h3>
				<p>{t("ui.tokenUsage.help.capacity")}</p>
			</section>
			<HelpIllustration
				variant="flow"
				title={t("ui.tokenUsage.help.flowTitle")}
				steps={[
					{
						title: t("ui.tokenUsage.help.conversationStep"),
						description: t("ui.tokenUsage.help.conversationStepDescription"),
					},
					{
						title: t("ui.tokenUsage.help.compactStep"),
						description: t("ui.tokenUsage.help.compactStepDescription"),
					},
					{
						title: t("ui.tokenUsage.help.continueStep"),
						description: t("ui.tokenUsage.help.continueStepDescription"),
					},
				]}
			/>
			<section className="space-y-2">
				<h3 className="text-lg font-semibold">{t("ui.tokenUsage.help.whenTitle")}</h3>
				<p>{t("ui.tokenUsage.help.when")}</p>
				<p className="text-muted-foreground">{t("ui.tokenUsage.help.threshold")}</p>
			</section>
			<section className="space-y-2">
				<h3 className="text-lg font-semibold">{t("ui.tokenUsage.help.changesTitle")}</h3>
				<p>{t("ui.tokenUsage.help.changes")}</p>
				<div className="space-y-2 rounded-xl border bg-muted/30 p-4">
					<p className="font-medium">{t("ui.tokenUsage.help.exampleTitle")}</p>
					<p>{t("ui.tokenUsage.help.exampleBefore")}</p>
					<p>{t("ui.tokenUsage.help.exampleAfter")}</p>
				</div>
			</section>
			<section className="space-y-2">
				<h3 className="text-lg font-semibold">{t("ui.tokenUsage.help.manualTitle")}</h3>
				<p>{t("ui.tokenUsage.help.manual")}</p>
			</section>
			<aside className="space-y-2 rounded-xl border bg-muted/30 p-4">
				<h3 className="font-semibold">{t("ui.tokenUsage.help.detailsTitle")}</h3>
				<p>{t("ui.tokenUsage.help.details")}</p>
			</aside>
		</article>
	)
}
