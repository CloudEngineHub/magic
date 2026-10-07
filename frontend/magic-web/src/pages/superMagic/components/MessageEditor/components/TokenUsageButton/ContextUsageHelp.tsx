import { lazy } from "react"
import { CircleHelp } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ContextHelp } from "@/components/shadcn-composed/context-help"

const ContextUsageHelpContent = lazy(() => import("./ContextUsageHelpContent"))

/** 复用全局帮助的简介、弹窗与焦点恢复；正文只在用户打开说明时加载。 */
export default function ContextUsageHelp() {
	const { t } = useTranslation("super")

	return (
		<ContextHelp
			mode="dialog"
			help={{
				title: t("ui.tokenUsage.help.title"),
				summary: t("ui.tokenUsage.help.summary"),
				tone: "neutral",
				renderBody: () => <ContextUsageHelpContent />,
			}}
		>
			<button
				type="button"
				aria-label={t("ui.tokenUsage.help.label")}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<CircleHelp size={16} aria-hidden />
			</button>
		</ContextHelp>
	)
}
