import { lazy } from "react"
import { BookOpen } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { ContextHelp } from "@/components/shadcn-composed/context-help"
import { useIsMobile } from "@/hooks/useIsMobile"

const TerminalHelpBrowser = lazy(() => import("./TerminalHelpBrowser"))
const TerminalHelpArticle = lazy(() => import("./TerminalHelpArticle"))

/** 入口沿用共享帮助的弹窗、焦点恢复和加载边界，阅读正文只在打开时加载。 */
export function TerminalHelpButton() {
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	return (
		<ContextHelp
			mode="dialog"
			help={{
				title: t("terminal.help.overview.title"),
				summary: t("terminal.help.summary"),
				tone: "indigo",
				renderBody: () => <TerminalHelpArticle articleId="overview" />,
			}}
			renderDialog={(props) => <TerminalHelpBrowser {...props} />}
		>
			<Button variant="ghost" size="sm" aria-label={t("terminal.guide")}>
				<BookOpen size={16} aria-hidden />
				{!isMobile && t("terminal.guide")}
			</Button>
		</ContextHelp>
	)
}
