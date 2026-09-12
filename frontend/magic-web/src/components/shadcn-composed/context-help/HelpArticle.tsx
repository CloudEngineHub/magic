import { useTranslation } from "react-i18next"

export interface HelpArticleProps {
	usage: string
	example: string
	note: string
}

/** 文件等用途说明共用阅读层级；内容由所属业务提供，简介在面板标题下展示。 */
export function HelpArticle({ usage, example, note }: HelpArticleProps) {
	const { t } = useTranslation("interface")
	return (
		<>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.usage")}</h3>
				<p>{usage}</p>
			</section>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.example")}</h3>
				<p className="rounded-md bg-muted px-3 py-2">{example}</p>
			</section>
			<section className="space-y-2">
				<h3 className="font-semibold">{t("contextHelp.note")}</h3>
				<p className="text-muted-foreground">{note}</p>
			</section>
		</>
	)
}
