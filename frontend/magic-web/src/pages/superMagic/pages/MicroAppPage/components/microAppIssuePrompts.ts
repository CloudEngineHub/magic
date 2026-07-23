import issuePromptData from "./microAppIssuePrompts.json"

export type MicroAppIssueLocale = "zh_CN" | "en_US"

export interface LocalizedIssueText {
	zh_CN: string
	en_US: string
}

export interface LocalizedIssueList {
	zh_CN: string[]
	en_US: string[]
}

export interface MicroAppIssueCategory {
	id: string
	label: LocalizedIssueText
}

export interface MicroAppIssuePrompt {
	id: string
	category: string
	featured: boolean
	title: LocalizedIssueText
	description: LocalizedIssueText
	keywords: LocalizedIssueList
	checks: LocalizedIssueList
}

interface MicroAppIssuePromptData {
	promptTemplates: LocalizedIssueText
	categories: MicroAppIssueCategory[]
	issues: MicroAppIssuePrompt[]
}

export const microAppIssuePromptData = issuePromptData as MicroAppIssuePromptData

export function resolveMicroAppIssueLocale(language?: string): MicroAppIssueLocale {
	return language?.toLowerCase().startsWith("zh") ? "zh_CN" : "en_US"
}

export function buildMicroAppIssuePrompt(issue: MicroAppIssuePrompt, language?: string): string {
	const locale = resolveMicroAppIssueLocale(language)
	const checks = issue.checks[locale].map((check) => `- ${check}`).join("\n")

	return microAppIssuePromptData.promptTemplates[locale]
		.replace("{{title}}", issue.title[locale])
		.replace("{{description}}", issue.description[locale])
		.replace("{{checks}}", checks)
}

export function searchMicroAppIssuePrompts(
	issues: MicroAppIssuePrompt[],
	query: string,
	language?: string,
): MicroAppIssuePrompt[] {
	const normalizedQuery = query.trim().toLocaleLowerCase()
	if (!normalizedQuery) return issues

	const locale = resolveMicroAppIssueLocale(language)
	return issues.filter((issue) => {
		const searchText = [
			issue.title[locale],
			issue.description[locale],
			...issue.keywords[locale],
		]
			.join(" ")
			.toLocaleLowerCase()

		return searchText.includes(normalizedQuery)
	})
}
