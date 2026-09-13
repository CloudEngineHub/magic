import { getClawBrandTranslationValues } from "@/pages/superMagic/utils/clawBrand"
import { useTranslation } from "react-i18next"
import { HelpArticle, type HelpGuide } from "@/components/shadcn-composed/context-help/HelpArticle"
import type { HelpDefinition } from "@/components/shadcn-composed/context-help"
import { TopicFileTag } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileTag"
import { useSystemFileHelp } from "@/pages/superMagic/components/TopicFilesButton/hooks/useSystemFileHelp"

export type ClawFileHelpKind =
	| "scheduledTasks"
	| "installedSkills"
	| "memoryFolder"
	| "skillList"
	| "proactiveExecution"
	| "identityInfo"
	| "guidelines"
	| "toolList"
	| "aboutYou"
	| "initialSetup"
	| "memoryFile"
	| "prompts"

/** 匹配器只决定用途；标签在组件中翻译，语言切换时不保留旧文案。 */
export function ClawFileHelpTag({ kind }: { kind: ClawFileHelpKind }) {
	const { t } = useTranslation("super")
	const brand = getClawBrandTranslationValues()
	const system = useSystemFileHelp(kind === "prompts" ? "clawInstructions" : undefined)
	if (kind === "prompts") return system ? <TopicFileTag {...system} /> : null
	const entries: Record<Exclude<ClawFileHelpKind, "prompts">, () => HelpDefinition> = {
		scheduledTasks: () => ({
			title: t("topicFiles.clawPlaygroundTags.scheduledTasks"),
			summary: t("topicFiles.clawPlaygroundHelp.scheduledTasks"),
			renderBody: () => (
				<HelpArticle
					visual="flow"
					guide={
						t("topicFiles.clawPlaygroundDetails.scheduledTasks.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.scheduledTasks.usage")}
					example={t("topicFiles.clawPlaygroundDetails.scheduledTasks.example")}
					note={t("topicFiles.clawPlaygroundDetails.scheduledTasks.note")}
				/>
			),
		}),
		installedSkills: () => ({
			title: t("topicFiles.clawPlaygroundTags.installedSkills"),
			summary: t("topicFiles.clawPlaygroundHelp.installedSkills"),
			renderBody: () => (
				<HelpArticle
					visual="tree"
					guide={
						t("topicFiles.clawPlaygroundDetails.installedSkills.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.installedSkills.usage")}
					example={t("topicFiles.clawPlaygroundDetails.installedSkills.example")}
					note={t("topicFiles.clawPlaygroundDetails.installedSkills.note")}
				/>
			),
		}),
		memoryFolder: () => ({
			title: t("topicFiles.clawPlaygroundTags.memoryFolder"),
			summary: t("topicFiles.clawPlaygroundHelp.memoryFolder"),
			renderBody: () => (
				<HelpArticle
					visual="tree"
					guide={
						t("topicFiles.clawPlaygroundDetails.memoryFolder.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.memoryFolder.usage")}
					example={t("topicFiles.clawPlaygroundDetails.memoryFolder.example")}
					note={t("topicFiles.clawPlaygroundDetails.memoryFolder.note")}
				/>
			),
		}),
		skillList: () => ({
			title: t("topicFiles.clawPlaygroundTags.skillList"),
			summary: t("topicFiles.clawPlaygroundHelp.skillList"),
			renderBody: () => (
				<HelpArticle
					visual="flow"
					guide={
						t("topicFiles.clawPlaygroundDetails.skillList.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.skillList.usage")}
					example={t("topicFiles.clawPlaygroundDetails.skillList.example")}
					note={t("topicFiles.clawPlaygroundDetails.skillList.note")}
				/>
			),
		}),
		proactiveExecution: () => ({
			title: t("topicFiles.clawPlaygroundTags.proactiveExecution"),
			summary: t("topicFiles.clawPlaygroundHelp.proactiveExecution"),
			renderBody: () => (
				<HelpArticle
					visual="flow"
					guide={
						t("topicFiles.clawPlaygroundDetails.proactiveExecution.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.proactiveExecution.usage")}
					example={t("topicFiles.clawPlaygroundDetails.proactiveExecution.example")}
					note={t("topicFiles.clawPlaygroundDetails.proactiveExecution.note")}
				/>
			),
		}),
		identityInfo: () => ({
			title: t("topicFiles.clawPlaygroundTags.identityInfo"),
			summary: t("topicFiles.clawPlaygroundHelp.identityInfo"),
			renderBody: () => (
				<HelpArticle
					visual="document"
					guide={
						t("topicFiles.clawPlaygroundDetails.identityInfo.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.identityInfo.usage")}
					example={t("topicFiles.clawPlaygroundDetails.identityInfo.example")}
					note={t("topicFiles.clawPlaygroundDetails.identityInfo.note")}
				/>
			),
		}),
		guidelines: () => ({
			title: t("topicFiles.clawPlaygroundTags.guidelines", brand),
			summary: t("topicFiles.clawPlaygroundHelp.guidelines", brand),
			renderBody: () => (
				<HelpArticle
					visual="document"
					guide={
						t("topicFiles.clawPlaygroundDetails.guidelines.guide", {
							returnObjects: true,
							...brand,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.guidelines.usage", brand)}
					example={t("topicFiles.clawPlaygroundDetails.guidelines.example", brand)}
					note={t("topicFiles.clawPlaygroundDetails.guidelines.note", brand)}
				/>
			),
		}),
		toolList: () => ({
			title: t("topicFiles.clawPlaygroundTags.toolList"),
			summary: t("topicFiles.clawPlaygroundHelp.toolList"),
			renderBody: () => (
				<HelpArticle
					visual="document"
					guide={
						t("topicFiles.clawPlaygroundDetails.toolList.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.toolList.usage")}
					example={t("topicFiles.clawPlaygroundDetails.toolList.example")}
					note={t("topicFiles.clawPlaygroundDetails.toolList.note")}
				/>
			),
		}),
		aboutYou: () => ({
			title: t("topicFiles.clawPlaygroundTags.aboutYou"),
			summary: t("topicFiles.clawPlaygroundHelp.aboutYou"),
			renderBody: () => (
				<HelpArticle
					visual="document"
					guide={
						t("topicFiles.clawPlaygroundDetails.aboutYou.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.aboutYou.usage")}
					example={t("topicFiles.clawPlaygroundDetails.aboutYou.example")}
					note={t("topicFiles.clawPlaygroundDetails.aboutYou.note")}
				/>
			),
		}),
		initialSetup: () => ({
			title: t("topicFiles.clawPlaygroundTags.initialSetup"),
			summary: t("topicFiles.clawPlaygroundHelp.initialSetup"),
			renderBody: () => (
				<HelpArticle
					visual="flow"
					guide={
						t("topicFiles.clawPlaygroundDetails.initialSetup.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.initialSetup.usage")}
					example={t("topicFiles.clawPlaygroundDetails.initialSetup.example")}
					note={t("topicFiles.clawPlaygroundDetails.initialSetup.note")}
				/>
			),
		}),
		memoryFile: () => ({
			title: t("topicFiles.clawPlaygroundTags.memoryFile"),
			summary: t("topicFiles.clawPlaygroundHelp.memoryFile"),
			renderBody: () => (
				<HelpArticle
					visual="document"
					guide={
						t("topicFiles.clawPlaygroundDetails.memoryFile.guide", {
							returnObjects: true,
						}) as HelpGuide
					}
					usage={t("topicFiles.clawPlaygroundDetails.memoryFile.usage")}
					example={t("topicFiles.clawPlaygroundDetails.memoryFile.example")}
					note={t("topicFiles.clawPlaygroundDetails.memoryFile.note")}
				/>
			),
		}),
	}
	const help = entries[kind]()
	return <TopicFileTag label={help.title} help={help} />
}
