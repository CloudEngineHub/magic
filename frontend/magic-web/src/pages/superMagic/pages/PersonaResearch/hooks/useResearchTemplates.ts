import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { ResearchOptions } from "../services/researchOptions"

export interface ResearchTemplate {
	id: string
	/** Short English label above the title, as in the prototype ("CHURN"). */
	kicker: string
	title: string
	description: string
	prompt: string
	/** Method shown in the card footer; method names are not translated. */
	method: string
	/** Study settings applied with the prompt; undefined leaves the current settings alone. */
	options?: ResearchOptions
}

/**
 * Study templates on the research home, one per research method.
 * Keys stay literal for i18n tooling; prompts prefill the composer and the user edits them.
 */
export function useResearchTemplates() {
	const { t } = useTranslation("personaResearch")

	return useMemo<ResearchTemplate[]>(
		() => [
			{
				id: "churn",
				kicker: "CHURN",
				method: "JTBD",
				title: t("template.churn.title"),
				description: t("template.churn.description"),
				prompt: t("template.churn.prompt"),
				options: { method: "user_research", panelSize: 8, rounds: 5 },
			},
			{
				id: "concept-test",
				kicker: "CONCEPT",
				method: "KANO",
				title: t("template.conceptTest.title"),
				description: t("template.conceptTest.description"),
				prompt: t("template.conceptTest.prompt"),
				options: { method: "concept_test", panelSize: 8, rounds: 5 },
			},
			{
				id: "pricing",
				kicker: "PRICING",
				method: "Van Westendorp",
				title: t("template.pricing.title"),
				description: t("template.pricing.description"),
				prompt: t("template.pricing.prompt"),
				options: { method: "user_research", panelSize: 8, rounds: 3 },
			},
			{
				id: "segment",
				kicker: "SEGMENT",
				method: "JTBD",
				title: t("template.segment.title"),
				description: t("template.segment.description"),
				prompt: t("template.segment.prompt"),
				options: { method: "product_rnd", panelSize: 10, rounds: 3 },
			},
			{
				id: "competitor",
				kicker: "COMPETE",
				method: "JTBD",
				title: t("template.competitor.title"),
				description: t("template.competitor.description"),
				prompt: t("template.competitor.prompt"),
				options: { method: "user_research", panelSize: 8, rounds: 5 },
			},
			{
				id: "import",
				kicker: "UPLOAD",
				method: t("template.import.kicker"),
				title: t("template.import.title"),
				description: t("template.import.description"),
				prompt: t("template.import.prompt"),
			},
		],
		[t],
	)
}
