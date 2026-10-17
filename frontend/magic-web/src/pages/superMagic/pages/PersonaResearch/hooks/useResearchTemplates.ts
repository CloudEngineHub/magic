import { useMemo } from "react"
import {
	ChartNoAxesCombined,
	FileUp,
	FlaskConical,
	Lightbulb,
	Megaphone,
	PenLine,
	Repeat,
	Swords,
	Tags,
	Target,
	UsersRound,
	type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

export interface ResearchStarter {
	id: string
	title: string
	description?: string
	prompt: string
	icon: LucideIcon
}

/**
 * Scenario chips and study templates on the research home.
 * Keys stay literal for i18n tooling; prompts prefill the composer and the user edits them.
 */
export function useResearchTemplates() {
	const { t } = useTranslation("personaResearch")

	return useMemo(() => {
		const scenarios: ResearchStarter[] = [
			{
				id: "consumer",
				icon: UsersRound,
				title: t("scenario.consumer"),
				prompt: t("scenario.consumerPrompt"),
			},
			{
				id: "product",
				icon: Lightbulb,
				title: t("scenario.product"),
				prompt: t("scenario.productPrompt"),
			},
			{
				id: "concept",
				icon: FlaskConical,
				title: t("scenario.concept"),
				prompt: t("scenario.conceptPrompt"),
			},
			{
				id: "competitor",
				icon: Swords,
				title: t("scenario.competitor"),
				prompt: t("scenario.competitorPrompt"),
			},
			{
				id: "brand",
				icon: Megaphone,
				title: t("scenario.brand"),
				prompt: t("scenario.brandPrompt"),
			},
			{
				id: "content",
				icon: PenLine,
				title: t("scenario.content"),
				prompt: t("scenario.contentPrompt"),
			},
		]
		const templates: ResearchStarter[] = [
			{
				id: "churn",
				icon: Repeat,
				title: t("template.churn.title"),
				description: t("template.churn.description"),
				prompt: t("template.churn.prompt"),
			},
			{
				id: "concept-test",
				icon: Target,
				title: t("template.conceptTest.title"),
				description: t("template.conceptTest.description"),
				prompt: t("template.conceptTest.prompt"),
			},
			{
				id: "pricing",
				icon: Tags,
				title: t("template.pricing.title"),
				description: t("template.pricing.description"),
				prompt: t("template.pricing.prompt"),
			},
			{
				id: "segment",
				icon: ChartNoAxesCombined,
				title: t("template.segment.title"),
				description: t("template.segment.description"),
				prompt: t("template.segment.prompt"),
			},
			{
				id: "import",
				icon: FileUp,
				title: t("template.import.title"),
				description: t("template.import.description"),
				prompt: t("template.import.prompt"),
			},
		]
		return { scenarios, templates }
	}, [t])
}
