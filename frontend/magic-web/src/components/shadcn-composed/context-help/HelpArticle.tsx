import { useTranslation } from "react-i18next"
import { FileText, Info, MessageSquare } from "lucide-react"
import { HelpIllustration, type HelpIllustrationProps, type HelpStep } from "./HelpIllustration"

export interface HelpGuide {
	context: string
	diagramTitle: string
	steps: HelpStep[]
	exampleContent: string
	result: string
	actions: string
}

export interface HelpArticleProps {
	usage: string
	example: string
	note: string
	guide: HelpGuide
	visual: HelpIllustrationProps["variant"]
}

/** 文件等用途说明共用阅读层级；内容由所属业务提供，简介在面板标题下展示。 */
export function HelpArticle({ usage, example, note, guide, visual }: HelpArticleProps) {
	const { t } = useTranslation("interface")
	return (
		<article className="space-y-8">
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.usage")}</h3>
				<p>{usage}</p>
				<p className="text-muted-foreground">{guide.context}</p>
			</section>
			<HelpIllustration title={guide.diagramTitle} steps={guide.steps} variant={visual} />
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.example")}</h3>
				<div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
					<MessageSquare size={16} aria-hidden className="mt-1.5 shrink-0 text-primary" />
					<p>{example}</p>
				</div>
				<div className="overflow-hidden rounded-lg border">
					<div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
						<FileText size={16} aria-hidden />
						{t("contextHelp.sampleContent")}
					</div>
					<pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6">
						{guide.exampleContent}
					</pre>
				</div>
				<p>{guide.result}</p>
			</section>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.actions")}</h3>
				<p>{guide.actions}</p>
			</section>
			<aside className="space-y-2 rounded-lg border bg-muted/30 p-4 text-muted-foreground">
				<h3 className="flex items-center gap-2 font-medium text-foreground">
					<Info size={16} aria-hidden />
					{t("contextHelp.note")}
				</h3>
				<p>{note}</p>
			</aside>
		</article>
	)
}
