import { useMemo } from "react"
import { useTranslation } from "react-i18next"

export interface ResearchStarter {
	id: string
	title: string
	description?: string
	prompt: string
	/** Method shown above a template title (e.g. "JTBD"); method names are not translated. */
	kicker?: string
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
				title: t("scenario.consumer"),
				prompt: t("scenario.consumerPrompt"),
			},
			{
				id: "product",
				title: t("scenario.product"),
				prompt: t("scenario.productPrompt"),
			},
			{
				id: "concept",
				title: t("scenario.concept"),
				prompt: t("scenario.conceptPrompt"),
			},
			{
				id: "competitor",
				title: t("scenario.competitor"),
				prompt: t("scenario.competitorPrompt"),
			},
			{
				id: "brand",
				title: t("scenario.brand"),
				prompt: t("scenario.brandPrompt"),
			},
			{
				id: "content",
				title: t("scenario.content"),
				prompt: t("scenario.contentPrompt"),
			},
		]
		const templates: ResearchStarter[] = [
			{
				id: "churn",
				kicker: "JTBD",
				title: t("template.churn.title"),
				description: t("template.churn.description"),
				prompt: t("template.churn.prompt"),
			},
			{
				id: "concept-test",
				kicker: "KANO",
				title: t("template.conceptTest.title"),
				description: t("template.conceptTest.description"),
				prompt: t("template.conceptTest.prompt"),
			},
			{
				id: "pricing",
				kicker: "Van Westendorp",
				title: t("template.pricing.title"),
				description: t("template.pricing.description"),
				prompt: t("template.pricing.prompt"),
			},
			{
				id: "segment",
				kicker: "JTBD",
				title: t("template.segment.title"),
				description: t("template.segment.description"),
				prompt: t("template.segment.prompt"),
			},
			{
				id: "import",
				kicker: t("template.import.kicker"),
				title: t("template.import.title"),
				description: t("template.import.description"),
				prompt: t("template.import.prompt"),
			},
		]
		return { scenarios, templates }
	}, [t])
}
