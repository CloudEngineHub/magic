import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import type { StudyType } from "../types"

export const RESEARCH_METHODS = [
	"auto",
	"user_research",
	"product_rnd",
	"concept_test",
	"fast_insight",
] as const satisfies readonly ("auto" | StudyType)[]
export const PANEL_SIZES = ["auto", 4, 6, 8, 10, 12] as const
export const ROUND_COUNTS = ["auto", 3, 5, 7] as const

export interface ResearchOptions {
	method: (typeof RESEARCH_METHODS)[number]
	panelSize: (typeof PANEL_SIZES)[number]
	rounds: (typeof ROUND_COUNTS)[number]
}

export const DEFAULT_RESEARCH_OPTIONS: ResearchOptions = {
	method: "auto",
	panelSize: "auto",
	rounds: "auto",
}

/**
 * Fixed prefix of the settings line. The agent's skill reads the line as the user's answers to
 * scale and study type, and the conversation can match it to render a tag; keep it unchanged.
 */
export const RESEARCH_SETTINGS_PREFIX = "【研究设置】"

/**
 * One line appended to the first message, e.g.
 * "【研究设置】访谈人数: 8 · 访谈轮数: 5 · 研究方式: concept_test · 报告模板: templates/brand.html".
 * Items left on "auto" (or the default report template, null) are omitted; with nothing fixed
 * there is no line. Labels stay in Chinese whatever the UI language, because the skill matches
 * them literally.
 */
export function researchSettingsLine(
	options: ResearchOptions,
	reportTemplatePath: string | null = null,
): string | null {
	const items = [
		options.panelSize === "auto" ? null : `访谈人数: ${options.panelSize}`,
		options.rounds === "auto" ? null : `访谈轮数: ${options.rounds}`,
		options.method === "auto" ? null : `研究方式: ${options.method}`,
		reportTemplatePath ? `报告模板: ${reportTemplatePath}` : null,
	].filter(Boolean)
	return items.length ? `${RESEARCH_SETTINGS_PREFIX}${items.join(" · ")}` : null
}

/** Appends a plain paragraph to an editor document without mutating it. */
export function appendParagraph(value: JSONContent | undefined, text: string): JSONContent {
	const paragraph: JSONContent = { type: "paragraph", content: [{ type: "text", text }] }
	if (!value) return { type: "doc", content: [paragraph] }
	return { ...value, content: [...(value.content ?? []), paragraph] }
}

/** Restores saved settings, dropping values that are no longer offered. */
export function parseResearchOptions(raw: unknown): ResearchOptions {
	const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const pickFrom = <T>(list: readonly T[], candidate: unknown, fallback: T): T =>
		list.includes(candidate as T) ? (candidate as T) : fallback
	return {
		method: pickFrom(RESEARCH_METHODS, value.method, "auto"),
		panelSize: pickFrom(PANEL_SIZES, value.panelSize, "auto"),
		rounds: pickFrom(ROUND_COUNTS, value.rounds, "auto"),
	}
}

const REPORT_TEMPLATE_STORAGE_KEY = "persona-research:report-template"

/**
 * The report template picked for new studies, remembered per browser as a convenience only;
 * null means the default. The caller drops a path that no longer exists.
 */
export function readSavedReportTemplate(): string | null {
	try {
		return localStorage.getItem(REPORT_TEMPLATE_STORAGE_KEY) || null
	} catch {
		return null
	}
}

export function saveReportTemplateChoice(path: string | null) {
	try {
		if (path) localStorage.setItem(REPORT_TEMPLATE_STORAGE_KEY, path)
		else localStorage.removeItem(REPORT_TEMPLATE_STORAGE_KEY)
	} catch {
		// Storage can be unavailable (private mode); the choice still applies to this page.
	}
}
