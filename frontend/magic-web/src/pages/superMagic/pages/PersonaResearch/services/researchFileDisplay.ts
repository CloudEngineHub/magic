import type { ReactNode } from "react"
import type {
	ProjectFileDisplay,
	ProjectFileDisplayResolver,
} from "@/components/business/MentionPanel/types"
import {
	DEFAULT_REPORT_TEMPLATE_PATH,
	PANELS_DIR,
	PERSONAS_DIR,
	STUDIES_DIR,
	TEMPLATES_DIR,
	reportTemplateName,
} from "./researchFiles"
import { TEMPLATE_CHATS_DIR } from "./templateChats"

export interface ResearchFileDisplayLabels {
	personas: string
	panels: string
	studies: string
	templates: string
	defaultTemplate: string
	interviews: string
	discussions: string
	/** Names of the study files, same wording as the workspace tabs. */
	study: { report: string; plan: string; deskResearch: string; validation: string; panel: string }
}

export interface ResearchFileDisplayIcons {
	personas?: ReactNode
	panels?: ReactNode
	studies?: ReactNode
	templates?: ReactNode
}

/** Study files with a readable name, keyed by their name inside studies/<slug>/. */
function studyFileLabel(name: string, labels: ResearchFileDisplayLabels["study"]) {
	const byName: Record<string, string> = {
		"report.html": labels.report,
		"plan.md": labels.plan,
		"desk-research.md": labels.deskResearch,
		"validation-questionnaire.md": labels.validation,
		"panel.json": labels.panel,
	}
	return byName[name]
}

/**
 * Readable names for the research project's own folders and files in the @ panel's
 * "Current project files". Display only: the resolver never sees ids and cannot change a path,
 * so what a mention inserts still points at the real file.
 *
 * | Real path                          | Shown as                     |
 * | personas/ · panels/ · studies/     | 人设 · 人设分组 · 研究          |
 * | templates/ · templates/<name>.html | 报告模板 · 模板名 (voices → 人声（默认）) |
 * | template-chats/ (and below)        | hidden: internal conversation markers |
 * | studies/<slug>/report.html …       | 研究报告 / 研究方案 / 市场洞察 / 验证问卷 / 受访者名单 |
 * | studies/<slug>/interviews/ · discussions/ | 访谈记录 · 小组讨论 |
 *
 * Everything else (persona files, study slugs, unknown folders) keeps its real name.
 */
export function createResearchFileDisplayResolver(
	labels: ResearchFileDisplayLabels,
	icons: ResearchFileDisplayIcons = {},
): ProjectFileDisplayResolver {
	return ({ path, name, isDirectory }): ProjectFileDisplay | null => {
		const normalized = path.replace(/\/+$/, "")
		const segments = normalized.split("/")

		if (`${segments[0]}/` === TEMPLATE_CHATS_DIR) return { hidden: true }

		if (isDirectory) {
			if (segments.length === 1) {
				const top: Record<string, [string, ReactNode | undefined]> = {
					[PERSONAS_DIR]: [labels.personas, icons.personas],
					[PANELS_DIR]: [labels.panels, icons.panels],
					[STUDIES_DIR]: [labels.studies, icons.studies],
					[TEMPLATES_DIR]: [labels.templates, icons.templates],
				}
				const match = top[`${normalized}/`]
				return match ? { name: match[0], icon: match[1] } : null
			}
			if (`${segments[0]}/` === STUDIES_DIR && segments.length === 3) {
				if (name === "interviews") return { name: labels.interviews }
				if (name === "discussions") return { name: labels.discussions }
			}
			return null
		}

		if (`${segments[0]}/` === TEMPLATES_DIR && segments.length === 2) {
			if (!normalized.toLowerCase().endsWith(".html")) return null
			return {
				name:
					normalized === DEFAULT_REPORT_TEMPLATE_PATH
						? labels.defaultTemplate
						: reportTemplateName(normalized),
			}
		}

		if (`${segments[0]}/` === STUDIES_DIR && segments.length === 3) {
			const label = studyFileLabel(name, labels.study)
			return label ? { name: label } : null
		}

		return null
	}
}
